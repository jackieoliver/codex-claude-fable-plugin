#!/usr/bin/env node
// Claude for Codex — wrapper behind the $claude skill (see SPEC.md).
// Owns the word grammar, defaults, per-project conversation memory, and the
// spawn of the local `claude` CLI. Zero dependencies.

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const MODEL_ALIASES = ["auto", "fable", "opus", "sonnet", "haiku"];
const ROUTABLE_MODELS = ["haiku", "sonnet", "opus", "fable", "fable-lite"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const MODIFIERS = new Set(["new", "repo"]);
const SUBCOMMANDS = new Set(["models", "use", "config", "on", "start", "stop", "off", "codex"]);
const BUILT_IN_DEFAULTS = { model: "auto", effort: "xhigh" };
const ROUTER_FALLBACK = { model: "fable", effort: "xhigh" };
// When the router picked the model AND the user named no effort anywhere,
// the routed model brings a matching effort (a named effort always wins).
const ROUTED_EFFORT = { haiku: "low", sonnet: "high", opus: "xhigh", fable: "xhigh", "fable-lite": "low" };
const READ_ONLY_TOOLS = ["Read", "Grep", "Glob"];
const STATE_DIR = ".codex-claude";
const SESSION_WARN_DAYS = 7;
const SESSION_WARN_CALLS = 50;

function usage() {
  return `Usage:
  codex-claude [model] [effort] [new] [repo] <prompt...>
  codex-claude models                     list models/efforts, defaults marked
  codex-claude use <model> [effort]       persist new defaults
  codex-claude config                     show resolved config + session state
  codex-claude on                         mark Claude mode active for this project
  codex-claude stop                       mark Claude mode stopped for this project
  codex-claude -- <prompt...>             treat everything after -- as prompt

Models:  ${MODEL_ALIASES.join(", ")} (or any claude-* id verbatim)
Default is auto: a conservative router keeps ${ROUTER_FALLBACK.model} unless the prompt
is clearly asking for a smaller model. Effort defaults to ${BUILT_IN_DEFAULTS.effort} unless named.
Efforts: ${EFFORTS.join(", ")}
Keywords: new (fresh conversation), repo (read-only repo access this call)

Flags: --dry-run  --smoke  --allow-customizations  --help
Env:   CODEX_CLAUDE_MODEL, CODEX_CLAUDE_EFFORT, CODEX_CLAUDE_ALLOW_CUSTOMIZATIONS=1
`;
}

function isModelToken(token) {
  const lower = token.toLowerCase();
  return MODEL_ALIASES.includes(lower) || lower.startsWith("claude-");
}

function isEffortToken(token) {
  return EFFORTS.includes(token.toLowerCase());
}

// The whole grammar lives here. Input is the raw word list after `$claude`.
// Leading reserved words (model, effort, new, repo) are consumed in any order,
// at most once per category; the first non-reserved word starts the prompt;
// `--` ends sniffing explicitly. Subcommands are recognized as first word only.
export function parseInvocation(rawArgv) {
  const parsed = {
    kind: "ask",
    model: null,
    effort: null,
    fresh: false,
    repo: false,
    prompt: "",
    dryRun: false,
    help: false,
    smoke: false,
    allowCustomizations: process.env.CODEX_CLAUDE_ALLOW_CUSTOMIZATIONS === "1",
    useArgs: [],
    errors: [],
  };

  // Split off wrapper flags first; everything else is grammar words.
  const words = [];
  for (const arg of rawArgv) {
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--smoke") parsed.smoke = true;
    else if (arg === "--allow-customizations") parsed.allowCustomizations = true;
    else words.push(...String(arg).split(/\s+/).filter(Boolean));
  }

  if (parsed.help || parsed.smoke) return parsed;

  if (words.length > 0 && SUBCOMMANDS.has(words[0].toLowerCase())) {
    parsed.kind = words[0].toLowerCase();
    parsed.useArgs = words.slice(1);
    return parsed;
  }

  let index = 0;
  let sniffing = true;
  while (sniffing && index < words.length) {
    const word = words[index];
    const lower = word.toLowerCase();

    if (word === "--") {
      index += 1;
      break;
    }
    if (parsed.model === null && isModelToken(word)) {
      parsed.model = lower;
      index += 1;
      continue;
    }
    if (parsed.effort === null && isEffortToken(word)) {
      parsed.effort = lower;
      index += 1;
      continue;
    }
    if (MODIFIERS.has(lower) && !(lower === "new" ? parsed.fresh : parsed.repo)) {
      if (lower === "new") parsed.fresh = true;
      else parsed.repo = true;
      index += 1;
      continue;
    }
    sniffing = false; // first non-reserved (or repeated-category) word: prompt starts
  }

  parsed.prompt = words.slice(index).join(" ").trim();
  return parsed;
}

async function loadJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function saveJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveSetting({ cli, env, config, builtIn }) {
  if (cli) return { value: cli, source: "call" };
  if (env) return { value: env, source: "env" };
  if (config) return { value: config, source: "config" };
  return { value: builtIn, source: "built-in" };
}

// Session per project: reuse state.sessionId via --resume, or mint a UUID via
// --session-id so streaming needs no output parsing (SPEC §Memory).
export function buildClaudeArgs({ model, effort, repo, sessionId, resume, allowCustomizations, prompt }) {
  const args = resume ? ["--resume", sessionId] : ["--session-id", sessionId];
  args.push("--model", model, "--effort", effort);
  if (!allowCustomizations) args.push("--safe-mode");
  if (repo) args.push("--allowedTools", ...READ_ONLY_TOOLS);
  else args.push("--tools", "");
  args.push("-p", prompt);
  return args;
}

async function commandModels(paths) {
  const config = await loadJson(paths.config);
  const model = config.model || BUILT_IN_DEFAULTS.model;
  const effort = config.effort || BUILT_IN_DEFAULTS.effort;
  const lines = ["Models:"];
  for (const alias of MODEL_ALIASES) {
    const note = alias === "auto" ? " — router picks per prompt" : "";
    lines.push(`  ${alias === model ? "✓" : " "} ${alias}${note}`);
  }
  lines.push("  (any claude-* model id also works verbatim)", "", "Efforts:");
  for (const level of EFFORTS) {
    lines.push(`  ${level === effort ? "✓" : " "} ${level}`);
  }
  lines.push("", `Change defaults: codex-claude use <model> [effort]`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function commandUse(paths, useArgs) {
  const update = {};
  for (const word of useArgs) {
    if (isModelToken(word)) update.model = word.toLowerCase();
    else if (isEffortToken(word)) update.effort = word.toLowerCase();
    else throw new Error(`Not a model or effort: ${JSON.stringify(word)}\n${usage()}`);
  }
  if (Object.keys(update).length === 0) {
    throw new Error(`Nothing to set.\n${usage()}`);
  }
  const config = { ...(await loadJson(paths.config)), ...update };
  await saveJson(paths.config, config);
  process.stdout.write(`Defaults updated: ${JSON.stringify(config)} (${paths.config})\n`);
}

async function commandMode(paths, enabled) {
  const config = { ...(await loadJson(paths.config)), stickyMode: enabled };
  await saveJson(paths.config, config);
  process.stdout.write(`${enabled ? "Claude mode enabled" : "Claude mode stopped"} (${paths.config})\n`);
}

async function commandConfig(paths) {
  const config = await loadJson(paths.config);
  const state = await loadJson(paths.state);
  const resolved = {
    stickyMode: config.stickyMode !== false ? "on" : "stopped",
    model: resolveSetting({
      cli: null,
      env: process.env.CODEX_CLAUDE_MODEL,
      config: config.model,
      builtIn: BUILT_IN_DEFAULTS.model,
    }),
    effort: resolveSetting({
      cli: null,
      env: process.env.CODEX_CLAUDE_EFFORT,
      config: config.effort,
      builtIn: BUILT_IN_DEFAULTS.effort,
    }),
    session: state.sessionId
      ? { sessionId: state.sessionId, createdAt: state.createdAt, callCount: state.callCount || 0 }
      : "none (next call starts one)",
    stateDir: paths.dir,
  };
  process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
}

// Auto-router: a fast, stateless haiku call reads the prompt and picks the
// model. Never touches the conversation session. Any failure falls back to
// ROUTER_FALLBACK rather than blocking the user's question.
function routerInstruction(prompt) {
  return [
    "Pick which Claude model should answer the user's prompt below.",
    "Reply with EXACTLY one word on one line: MODEL",
    "Default to fable. Only choose a smaller model when the prompt is obviously suited to it.",
    "If there is any ambiguity, uncertainty, hidden complexity, or open-ended reasoning, choose fable.",
    "MODEL choices: haiku = trivial lookups, quick facts, tiny snippets;",
    "sonnet = clearly routine coding and writing questions, summaries;",
    "opus = bounded complex debugging, careful analysis, code review;",
    "fable = default, hardest reasoning, architecture, deep open-ended thinking;",
    "fable-lite = trivial questions about the assistant itself.",
    "ABSOLUTE RULE: if the prompt asks about the assistant itself (its model, identity,",
    "version, capabilities, or configuration), you MUST reply fable-lite (if trivial) or",
    "fable (if complex) — NEVER haiku, sonnet, or opus, because the answer depends on",
    "which model answers.",
    "",
    `User prompt: ${prompt}`,
  ].join("\n");
}

function routeModel(prompt) {
  const args = [
    "--model", "haiku",
    "--effort", "low",
    "--safe-mode",
    "--no-session-persistence",
    "--tools", "",
    "-p", routerInstruction(prompt),
  ];
  return new Promise((resolve) => {
    const child = spawn("claude", args, { env: process.env, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    const finish = (routed) => resolve(routed);
    const timer = setTimeout(() => {
      child.kill();
      finish({ ...ROUTER_FALLBACK, source: "router-timeout" });
    }, 60000);
    child.on("error", () => {
      clearTimeout(timer);
      finish({ ...ROUTER_FALLBACK, source: "router-error" });
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const tokens = stdout.toLowerCase().split(/\s+/).map((t) => t.replace(/[^a-z-]/g, ""));
      const model = tokens.find((t) => ROUTABLE_MODELS.includes(t));
      if (exitCode === 0 && model) finish({ model, source: "router" });
      else finish({ ...ROUTER_FALLBACK, source: "router-fallback" });
    });
  });
}

function looksLikeMissingSession(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("no conversation found") ||
    (lower.includes("session") && (lower.includes("not found") || lower.includes("does not exist")))
  );
}

function runClaudeOnce(claudeArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", claudeArgs, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", (error) =>
      reject(error?.code === "ENOENT" ? new Error("claude CLI not found — install and authenticate Claude Code first.") : error),
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

async function writeRunLog(paths, { model, effort, repo, sessionId, prompt, result }) {
  await mkdir(paths.runs, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(paths.runs, `${stamp}.md`);
  const log = [
    "---",
    `model: ${model}`,
    `effort: ${effort}`,
    `repo: ${repo}`,
    `sessionId: ${sessionId}`,
    `exitCode: ${result.exitCode}`,
    "---",
    "",
    "## Prompt",
    "",
    "```text",
    prompt,
    "```",
    "",
    "## Stdout",
    "",
    result.stdout || "(empty)",
    "",
    "## Stderr",
    "",
    "```text",
    result.stderr || "",
    "```",
    "",
  ].join("\n");
  await writeFile(logPath, log, "utf8");
  return logPath;
}

async function commandAsk(paths, parsed) {
  if (parsed.fresh) {
    await rm(paths.state, { force: true });
    if (!parsed.prompt) {
      process.stdout.write("Started a fresh conversation.\n");
      return;
    }
  }
  if (!parsed.prompt) throw new Error(`Missing prompt.\n${usage()}`);

  const config = await loadJson(paths.config);
  const state = parsed.fresh ? {} : await loadJson(paths.state);
  if (!parsed.dryRun && config.stickyMode !== true) {
    await saveJson(paths.config, { ...config, stickyMode: true });
  }

  let model = resolveSetting({
    cli: parsed.model,
    env: process.env.CODEX_CLAUDE_MODEL,
    config: config.model,
    builtIn: BUILT_IN_DEFAULTS.model,
  });
  let effort = resolveSetting({
    cli: parsed.effort,
    env: process.env.CODEX_CLAUDE_EFFORT,
    config: config.effort,
    builtIn: BUILT_IN_DEFAULTS.effort,
  });

  if (model.value === "auto" && !parsed.dryRun) {
    const routed = await routeModel(parsed.prompt);
    // fable-lite = fable answering trivia (e.g. identity checks): right model, small effort.
    model = { value: routed.model === "fable-lite" ? "fable" : routed.model, source: routed.source };
    if (effort.source === "built-in") {
      effort = { value: ROUTED_EFFORT[routed.model] || BUILT_IN_DEFAULTS.effort, source: routed.source };
    }
    process.stderr.write(`[claude] auto-router → ${model.value} ${effort.value}\n`);
  }

  const resume = Boolean(state.sessionId);
  if (resume && !parsed.dryRun) {
    const ageDays = state.createdAt ? (Date.now() - Date.parse(state.createdAt)) / 86400000 : 0;
    const calls = state.callCount || 0;
    if (ageDays > SESSION_WARN_DAYS || calls > SESSION_WARN_CALLS) {
      process.stderr.write(
        `[claude] heads-up: this conversation is ${Math.floor(ageDays)} day(s) old (${calls} calls) — say "new" to start fresh\n`,
      );
    }
  }
  const sessionId = state.sessionId || randomUUID();
  const claudeArgs = buildClaudeArgs({
    model: model.value,
    effort: effort.value,
    repo: parsed.repo,
    sessionId,
    resume,
    allowCustomizations: parsed.allowCustomizations,
    prompt: parsed.prompt,
  });

  if (parsed.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          command: "claude",
          args: claudeArgs,
          model,
          effort,
          repo: parsed.repo,
          session: resume ? "resume" : `new (${sessionId})`,
          note:
            model.value === "auto"
              ? `router keeps ${ROUTER_FALLBACK.model} unless a smaller model is obvious; effort resolves separately`
              : undefined,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  // Attribution header on STDOUT so it survives any relay: the reader always
  // knows which Claude answered, and that routing happened (issue #2).
  process.stdout.write(
    `[Claude · ${model.value} · ${effort.value}${parsed.allowCustomizations ? "" : " · safe-mode"}]\n`,
  );

  let usedSessionId = sessionId;
  let result = await runClaudeOnce(claudeArgs, paths.cwd);

  // Self-healing (SPEC §Memory): saved session was purged → fresh id, retry once.
  if (result.exitCode !== 0 && resume && looksLikeMissingSession(result.stdout + result.stderr)) {
    usedSessionId = randomUUID();
    process.stderr.write("\n[codex-claude] Saved session missing — starting a fresh conversation.\n");
    const retryArgs = buildClaudeArgs({
      model: model.value,
      effort: effort.value,
      repo: parsed.repo,
      sessionId: usedSessionId,
      resume: false,
      allowCustomizations: parsed.allowCustomizations,
      prompt: parsed.prompt,
    });
    result = await runClaudeOnce(retryArgs, paths.cwd);
  }

  const logPath = await writeRunLog(paths, {
    model: model.value,
    effort: effort.value,
    repo: parsed.repo,
    sessionId: usedSessionId,
    prompt: parsed.prompt,
    result,
  });

  if (result.exitCode !== 0) {
    if (/unknown (option|argument)|unrecognized/i.test(result.stderr)) {
      process.stderr.write(
        "\n[claude] The Claude CLI rejected a flag this plugin relies on (--session-id/--resume/--effort/--safe-mode/--tools). Your Claude Code version may have changed its flags — check claude --help and update the plugin.\n",
      );
    }
    process.stderr.write(`\nClaude call failed. Log: ${logPath}\n`);
    process.exitCode = result.exitCode;
    return;
  }

  await saveJson(paths.state, {
    sessionId: usedSessionId,
    createdAt: usedSessionId === state.sessionId ? state.createdAt : new Date().toISOString(),
    lastModel: model.value,
    callCount: usedSessionId === state.sessionId ? (state.callCount || 0) + 1 : 1,
  });
}

const SMOKE_CASES = [
  { argv: ["explain", "this"], expect: { kind: "ask", model: null, effort: null, prompt: "explain this" } },
  { argv: ["opus", "fix", "this", "bug"], expect: { model: "opus", prompt: "fix this bug" } },
  { argv: ["sonnet", "low", "summarize"], expect: { model: "sonnet", effort: "low", prompt: "summarize" } },
  { argv: ["low", "sonnet", "summarize"], expect: { model: "sonnet", effort: "low", prompt: "summarize" } },
  { argv: ["repo", "review", "my", "code"], expect: { repo: true, prompt: "review my code" } },
  { argv: ["opus", "repo", "review"], expect: { model: "opus", repo: true, prompt: "review" } },
  { argv: ["new", "opus", "start", "over"], expect: { fresh: true, model: "opus", prompt: "start over" } },
  { argv: ["--", "opus", "is", "great"], expect: { model: null, prompt: "opus is great" } },
  { argv: ["models"], expect: { kind: "models" } },
  { argv: ["use", "opus", "high"], expect: { kind: "use", useArgs: ["opus", "high"] } },
  { argv: ["config"], expect: { kind: "config" } },
  { argv: ["stop"], expect: { kind: "stop" } },
  { argv: ["on"], expect: { kind: "on" } },
  { argv: ["claude-opus-4-8", "hi"], expect: { model: "claude-opus-4-8", prompt: "hi" } },
  { argv: ["opus", "haiku", "vs", "opus"], expect: { model: "opus", prompt: "haiku vs opus" } },
  { argv: ["max", "think", "hard"], expect: { effort: "max", prompt: "think hard" } },
  { argv: ["auto", "quick", "question"], expect: { model: "auto", prompt: "quick question" } },
  { argv: ["use", "auto"], expect: { kind: "use", useArgs: ["auto"] } },
  { argv: ["opus high review my plan"], expect: { model: "opus", effort: "high", prompt: "review my plan" } },
];

function runSmoke() {
  let failures = 0;
  for (const { argv, expect } of SMOKE_CASES) {
    const parsed = parseInvocation(argv);
    const diffs = Object.entries(expect).filter(
      ([key, value]) => JSON.stringify(parsed[key]) !== JSON.stringify(value),
    );
    if (diffs.length === 0) {
      process.stdout.write(`PASS  ${JSON.stringify(argv.join(" "))}\n`);
    } else {
      failures += 1;
      for (const [key, value] of diffs) {
        process.stdout.write(
          `FAIL  ${JSON.stringify(argv.join(" "))} — ${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(parsed[key])}\n`,
        );
      }
    }
  }
  process.stdout.write(`\n${SMOKE_CASES.length - failures}/${SMOKE_CASES.length} grammar cases pass\n`);
  if (failures > 0) process.exitCode = 1;
}

// State lives OUTSIDE the project (~/.codex-claude/projects/<name>-<hash>/),
// so session ids and run logs — which contain full prompts and outputs — can
// never be committed to a repo. CODEX_CLAUDE_HOME overrides the root.
function resolvePaths(cwd) {
  const home = process.env.CODEX_CLAUDE_HOME || path.join(homedir(), STATE_DIR);
  const key = `${path.basename(cwd).replace(/[^a-zA-Z0-9_-]/g, "-")}-${createHash("sha256")
    .update(cwd)
    .digest("hex")
    .slice(0, 8)}`;
  const dir = path.join(home, "projects", key);
  return {
    cwd,
    dir,
    config: path.join(dir, "config.json"),
    state: path.join(dir, "state.json"),
    runs: path.join(dir, "runs"),
  };
}

// One-time migration from the old <cwd>/.codex-claude location.
async function migrateLegacyState(paths) {
  const legacyDir = path.join(paths.cwd, STATE_DIR);
  if (path.resolve(legacyDir) === path.resolve(paths.dir)) return;
  let migrated = false;
  for (const name of ["config.json", "state.json"]) {
    const legacy = await loadJson(path.join(legacyDir, name));
    if (Object.keys(legacy).length === 0) continue;
    const target = path.join(paths.dir, name);
    if (Object.keys(await loadJson(target)).length > 0) continue;
    await saveJson(target, legacy);
    migrated = true;
  }
  if (migrated) {
    process.stderr.write(
      `[claude] moved state out of the repo: ${legacyDir} → ${paths.dir} (old dir is safe to delete)\n`,
    );
  }
}

async function main() {
  const cwd = process.cwd();
  const paths = resolvePaths(cwd);
  await migrateLegacyState(paths);
  const parsed = parseInvocation(process.argv.slice(2));

  if (parsed.help) return void process.stdout.write(usage());
  if (parsed.smoke) return void runSmoke();
  if (parsed.kind === "models") return commandModels(paths);
  if (parsed.kind === "use") return commandUse(paths, parsed.useArgs);
  if (parsed.kind === "config") return commandConfig(paths);
  if (parsed.kind === "on" || parsed.kind === "start") return commandMode(paths, true);
  if (parsed.kind === "stop" || parsed.kind === "off" || parsed.kind === "codex") return commandMode(paths, false);
  return commandAsk(paths, parsed);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
