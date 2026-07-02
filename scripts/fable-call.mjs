#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const VALID_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const BUILT_IN_DEFAULT_EFFORT = "xhigh";
const BUILT_IN_DEFAULT_MODEL = "fable";

function normalizeEffort(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return VALID_EFFORTS.has(normalized) ? normalized : null;
}

function usage() {
  return `Usage:
  node scripts/fable-call.mjs [--effort <level>] [--model <model>] [--mode chat] -- <prompt>
  node scripts/fable-call.mjs --set-default-effort <level>
  node scripts/fable-call.mjs --show-config

Efforts: low, medium, high, xhigh, max
Default: ${BUILT_IN_DEFAULT_EFFORT}

By default, Claude runs with --safe-mode so local Claude plugins, hooks, MCP
servers, and project customizations are not loaded. Pass --allow-customizations
or set FABLE_ALLOW_CUSTOMIZATIONS=1 to omit --safe-mode.
`;
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    effort: null,
    model: null,
    mode: "chat",
    promptParts: [],
    setDefaultEffort: null,
    showConfig: false,
    allowCustomizations: process.env.FABLE_ALLOW_CUSTOMIZATIONS === "1",
  };

  let promptMode = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (promptMode) {
      parsed.promptParts.push(arg);
      continue;
    }

    if (arg === "--") {
      promptMode = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--show-config") {
      parsed.showConfig = true;
      continue;
    }

    if (arg === "--allow-customizations") {
      parsed.allowCustomizations = true;
      continue;
    }

    if (arg === "--set-default-effort") {
      parsed.setDefaultEffort = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--set-default-effort=")) {
      parsed.setDefaultEffort = arg.slice("--set-default-effort=".length);
      continue;
    }

    if (arg === "--effort") {
      parsed.effort = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--effort=")) {
      parsed.effort = arg.slice("--effort=".length);
      continue;
    }

    if (arg === "--model") {
      parsed.model = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--model=")) {
      parsed.model = arg.slice("--model=".length);
      continue;
    }

    if (arg === "--mode") {
      parsed.mode = argv[index + 1] || parsed.mode;
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      parsed.mode = arg.slice("--mode=".length);
      continue;
    }

    const effortMatch = arg.match(/^effort[:=](.+)$/i);
    if (effortMatch) {
      parsed.effort = effortMatch[1];
      continue;
    }

    const modelMatch = arg.match(/^model[:=](.+)$/i);
    if (modelMatch) {
      parsed.model = modelMatch[1];
      continue;
    }

    parsed.promptParts.push(arg);
  }

  return parsed;
}

async function readStdinIfAvailable() {
  if (process.stdin.isTTY) return "";

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadConfig(configPath) {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function saveConfig(configPath, config) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function resolveEffort({ cliEffort, envEffort, configEffort }) {
  const cli = normalizeEffort(cliEffort);
  if (cli) return { effort: cli, source: "cli" };

  const env = normalizeEffort(envEffort);
  if (env) return { effort: env, source: "env" };

  const config = normalizeEffort(configEffort);
  if (config) return { effort: config, source: "config" };

  return { effort: BUILT_IN_DEFAULT_EFFORT, source: "built-in" };
}

async function writeRunLog({ cwd, model, effort, mode, prompt, stdout, stderr, exitCode }) {
  const runDir = path.join(cwd, ".fable", "runs");
  await mkdir(runDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const hash = createHash("sha256").update(prompt).digest("hex").slice(0, 8);
  const logPath = path.join(runDir, `${stamp}-${hash}.md`);

  const log = [
    "---",
    `model: ${JSON.stringify(model)}`,
    `effort: ${JSON.stringify(effort)}`,
    `mode: ${JSON.stringify(mode)}`,
    `exitCode: ${exitCode}`,
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
    stdout || "(empty)",
    "",
    "## Stderr",
    "",
    "```text",
    stderr || "",
    "```",
    "",
  ].join("\n");

  await writeFile(logPath, log, "utf8");
  return logPath;
}

async function main() {
  const cwd = process.cwd();
  const configPath = path.join(cwd, ".fable", "config.json");
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const config = await loadConfig(configPath);

  if (args.showConfig) {
    const resolved = resolveEffort({
      cliEffort: null,
      envEffort: process.env.FABLE_EFFORT,
      configEffort: config.defaultEffort,
    });
    process.stdout.write(`${JSON.stringify({ ...config, resolvedEffort: resolved }, null, 2)}\n`);
    return;
  }

  if (args.setDefaultEffort) {
    const effort = normalizeEffort(args.setDefaultEffort);
    if (!effort) {
      throw new Error(`Invalid effort ${JSON.stringify(args.setDefaultEffort)}. ${usage()}`);
    }
    await saveConfig(configPath, { ...config, defaultEffort: effort });
    process.stdout.write(`Default Fable effort set to ${effort} in ${configPath}\n`);
    return;
  }

  const promptFromArgs = args.promptParts.join(" ").trim();
  const promptFromStdin = promptFromArgs ? "" : (await readStdinIfAvailable()).trim();
  const prompt = promptFromArgs || promptFromStdin;

  if (!prompt) {
    throw new Error(`Missing prompt.\n${usage()}`);
  }

  const resolvedEffort = resolveEffort({
    cliEffort: args.effort,
    envEffort: process.env.FABLE_EFFORT,
    configEffort: config.defaultEffort,
  });
  const model = args.model || process.env.FABLE_MODEL || config.defaultModel || BUILT_IN_DEFAULT_MODEL;
  const mode = args.mode || "chat";

  if (args.dryRun) {
    const dryRunArgs = ["--model", model, "--effort", resolvedEffort.effort, "--no-session-persistence"];
    if (!args.allowCustomizations) {
      dryRunArgs.push("--safe-mode");
    }
    if (mode === "chat") {
      dryRunArgs.push("--tools", "");
    }
    dryRunArgs.push("-p", prompt);

    process.stdout.write(
      `${JSON.stringify(
        {
          command: "claude",
          args: dryRunArgs,
          effortSource: resolvedEffort.source,
          mode,
          prompt,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const claudeArgs = ["--model", model, "--effort", resolvedEffort.effort, "--no-session-persistence"];

  if (!args.allowCustomizations) {
    claudeArgs.push("--safe-mode");
  }

  if (mode === "chat") {
    claudeArgs.push("--tools", "");
  }

  claudeArgs.push("-p", prompt);

  const child = spawn("claude", claudeArgs, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

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

  const exitCode = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  const logPath = await writeRunLog({
    cwd,
    model,
    effort: resolvedEffort.effort,
    mode,
    prompt,
    stdout,
    stderr,
    exitCode,
  });

  if (exitCode !== 0) {
    process.stderr.write(`\nFable call failed. Log: ${logPath}\n`);
    process.exitCode = exitCode || 1;
    return;
  }

  process.stderr.write(`\nFable log: ${logPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
