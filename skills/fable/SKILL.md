---
name: fable
description: Shortcut for $claude fable — route a Codex chat turn to Claude Fable. Use when the user invokes $fable or asks Fable directly.
---

# Fable (alias)

`$fable <anything>` is exactly `$claude fable <anything>`.

Call the wrapper with `fable` prepended to the user's words, verbatim:

```bash
codex-claude "fable <everything the user wrote after $fable>"
```

In this plugin development checkout, this equivalent command also works:

```bash
node scripts/claude-call.mjs "fable <everything the user wrote after $fable>"
```

Relay Claude's stdout as the primary answer. For the full grammar (effort words,
`repo`, `new`, memory), see `skills/claude/SKILL.md`.
