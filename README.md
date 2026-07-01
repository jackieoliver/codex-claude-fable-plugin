# Codex Claude Fable Plugin

Use Codex as the chat shell while delegating selected turns to Claude Code Fable.

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
