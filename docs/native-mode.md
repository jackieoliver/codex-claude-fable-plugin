# Native provider mode (experimental — not part of v1)

The `$claude` skill is the product. This document describes a separate,
experimental side quest: registering Anthropic as a **native Codex model
provider**, so Claude drives entire Codex sessions and appears in Codex's own
`/model` picker.

## Why this is experimental

- **Billing/auth:** it uses the Anthropic API directly via `ANTHROPIC_API_KEY`
  (per-token billing). Your Claude subscription login does not apply here.
- **Unproven fidelity:** Codex talks to providers over the OpenAI-compatible
  wire format. Anthropic ships a compat endpoint, but its behavior under
  Codex's agentic tool-calling loop has not been validated by this project.
- If either of those is a dealbreaker, use the `$claude` skill — that's what
  it's for.

## Current status

`scripts/setup-native.mjs` can **print** the config block. Automated
`apply`/`remove` of `~/.codex/config.toml` is planned (M3) but not implemented.

## Manual setup (for the brave)

1. Print the block:

```bash
node scripts/setup-native.mjs print
```

2. Paste it into `~/.codex/config.toml`. The block registers
   `[model_providers.anthropic]` (pointing at `https://api.anthropic.com/v1`,
   `wire_api = "chat"`) and four profiles: `claude-fable`, `claude-opus`,
   `claude-sonnet`, `claude-haiku`.

3. Make sure `ANTHROPIC_API_KEY` is set in the environment Codex runs in. The
   config references the env var by name (`env_key`) — **never paste the key
   itself into any file**.

4. Run Codex with a Claude profile:

```bash
codex --profile claude-opus
```

or switch with `/model` inside Codex.

To undo, delete everything between the `# >>> codex-claude native >>>` and
`# <<< codex-claude native <<<` markers in `~/.codex/config.toml`.
