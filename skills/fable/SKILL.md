---
name: fable
description: Call Claude Code Fable from Codex chat with configurable effort. Use when the user invokes $fable, asks to call Fable, or wants Claude Code/Fable to answer inside Codex.
---

# Claude Fable

Use this skill when the user invokes `$fable`, asks to call Fable, or wants Claude Code/Fable to answer inside Codex chat.

## Behavior

- Do not answer the task yourself before calling Fable.
- Extract an optional effort override from the user's request.
- Default effort is `xhigh`.
- Valid efforts are `low`, `medium`, `high`, `xhigh`, and `max`.
- Accepted override forms include `effort=high`, `effort:high`, `--effort high`, and `--effort=high`.
- Remove the effort override from the prompt before sending it to Fable.
- Call the local wrapper. Prefer the binary when available:

```bash
codex-fable --mode chat --effort <effort> -- "<user prompt>"
```

- In this plugin development checkout, this equivalent command also works:

```bash
node scripts/fable-call.mjs --mode chat --effort <effort> -- "<user prompt>"
```

- Relay Fable's stdout as the primary answer in the Codex chat.
- If the command fails, report the failure briefly and include the Claude CLI stderr if it is useful.

## Notes

- Prefer concise relaying. Avoid re-summarizing unless the user asks.
- For long or code-editing work, recommend `$fable-code` once that skill is enabled.
