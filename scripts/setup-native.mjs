#!/usr/bin/env node
// EXPERIMENTAL — native provider mode (see docs/native-mode.md + SPEC.md).
// `print` works today; automated `apply`/`remove` of ~/.codex/config.toml is
// planned (M3) but not implemented. The $claude skill is the supported path.

const BLOCK_BEGIN = "# >>> codex-claude native >>>";
const BLOCK_END = "# <<< codex-claude native <<<";

const PROFILES = [
  { profile: "claude-fable", model: "claude-fable-5" },
  { profile: "claude-opus", model: "claude-opus-4-8" },
  { profile: "claude-sonnet", model: "claude-sonnet-5" },
  { profile: "claude-haiku", model: "claude-haiku-4-5-20251001" },
];

// The API key is referenced via env_key and NEVER written to disk (SPEC).
function renderBlock() {
  const lines = [
    BLOCK_BEGIN,
    "[model_providers.anthropic]",
    'name = "Anthropic"',
    'base_url = "https://api.anthropic.com/v1"',
    'env_key = "ANTHROPIC_API_KEY"',
    'wire_api = "chat"',
  ];
  for (const { profile, model } of PROFILES) {
    lines.push("", `[profiles.${profile}]`, 'model_provider = "anthropic"', `model = "${model}"`);
  }
  lines.push(BLOCK_END);
  return `${lines.join("\n")}\n`;
}

function usage() {
  return `Usage:
  codex-claude-native print     show the config block that would be installed
  codex-claude-native apply     append block to ~/.codex/config.toml (TODO M3)
  codex-claude-native remove    delete the block from ~/.codex/config.toml (TODO M3)

Requires ANTHROPIC_API_KEY in your environment at Codex runtime (API billing,
separate from any Claude subscription). Experimental: Anthropic's OpenAI-compat
endpoint has not been validated against Codex's agentic tool loop yet.

After apply: codex --profile claude-opus   (or /model inside Codex)
`;
}

function main() {
  const command = process.argv[2] || "print";

  if (command === "print") {
    process.stdout.write(renderBlock());
    return;
  }

  // TODO(M3) apply: read ~/.codex/config.toml, refuse if block already present
  //   (idempotent), verify ANTHROPIC_API_KEY is set (warn if not — but never
  //   store it), append renderBlock(), print next steps.
  // TODO(M3) remove: strip everything between BLOCK_BEGIN/BLOCK_END inclusive.
  if (command === "apply" || command === "remove") {
    process.stderr.write(`Scaffold: "${command}" is not wired yet (TODO M3).\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  process.stderr.write(usage());
  process.exitCode = command === "help" ? 0 : 1;
}

main();
