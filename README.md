# Codex Claude Fable Plugin

Use Codex as the chat shell while delegating selected turns to Claude Code Fable.

## Requirements

- Codex CLI or Codex app with plugin support.
- Claude Code CLI installed and authenticated.
- Node.js 18 or newer.

Verify the Claude CLI is available:

```bash
claude --version
claude --help
```

## Install For Local Codex Use

Clone the public repo:

```bash
git clone https://github.com/pizzacorruption/codex-claude-fable-plugin.git
cd codex-claude-fable-plugin
```

Link the local wrapper binary:

```bash
npm link
codex-fable --help
```

Add this repo as a local Codex plugin marketplace:

```bash
codex plugin marketplace add "$(pwd)"
```

Then open Codex's plugin browser:

```text
/plugins
```

Install **Claude Fable**, start a new Codex thread, and invoke the skill:

```text
$fable say hi
```

Codex plugins load through marketplaces. This repo includes
`.agents/plugins/marketplace.json`, which points Codex at the plugin manifest in
this checkout.

## Effort

Fable defaults to `xhigh`.

Per-call override examples:

```text
$fable effort=high explain this bug
$fable --effort max review the payout code
$fable effort:low summarize this file
```

Project default override:

```bash
node scripts/fable-call.mjs --set-default-effort high
```

Environment override:

```bash
FABLE_EFFORT=high node scripts/fable-call.mjs -- "question"
```

Priority order is:

1. Per-call effort
2. `FABLE_EFFORT`
3. `.fable/config.json`
4. Built-in default `xhigh`

Valid efforts: `low`, `medium`, `high`, `xhigh`, `max`.

The wrapper sends the selected effort to Claude Code with:

```bash
claude --model fable --effort <effort> --no-session-persistence --safe-mode -p "<prompt>"
```

For chat mode, the wrapper also passes `--tools ""` so Claude answers without
using tools.

By default, the wrapper uses Claude `--safe-mode` to avoid loading local Claude
plugins, hooks, MCP servers, and project customizations. To opt into your local
Claude customizations for a call:

```bash
codex-fable --allow-customizations -- "question"
```

## Local Smoke Test

This does not call Claude:

```bash
node scripts/fable-call.mjs --dry-run --effort high -- "hello"
```

This calls the local Claude CLI:

```bash
node scripts/fable-call.mjs --effort xhigh -- "Brainstorm the plugin architecture."
```

After local linking, the same wrapper is available as:

```bash
npm link
codex-fable --effort high -- "hello"
```

## Usage In Codex

Ask Fable to answer directly:

```text
$fable explain this error
```

Choose effort per call:

```text
$fable effort=low summarize this file
$fable effort=high debug this failure
$fable --effort max pressure-test this architecture
```

Inspect the current default:

```text
$fable-config show
```

Change the project default:

```text
$fable-config set default effort high
```

Under the hood, `$fable-config` calls:

```bash
codex-fable --show-config
codex-fable --set-default-effort high
```

## Public Safety

This repository should not contain local Claude state, Codex state, logs,
transcripts, environment files, or API keys. `.gitignore` excludes `.claude/`,
`.codex/`, `.fable/`, `.env*`, logs, local overrides, and dependencies.
