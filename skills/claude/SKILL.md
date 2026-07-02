---
name: claude
description: Call a Claude model (fable, opus, sonnet, haiku) from Codex chat with a word-based model picker, effort selection, and per-project conversation memory. Use when the user invokes /claude or $claude, names a Claude model, or asks for Claude's take inside Codex.
---

# Claude for Codex

Use this skill when the user invokes `/claude` or `$claude`, names a Claude model, or wants a
Claude answer inside Codex chat.

## Behavior

- Do not answer the task yourself before calling Claude.
- Pass the user's words through **verbatim** — the wrapper owns the grammar
  (model picking, effort, keywords). Do not pre-parse, reorder, or strip words.
- Call the local wrapper. Prefer the binary when available:

```bash
codex-claude "<everything the user wrote after $claude>"
```

- In this plugin development checkout, this equivalent command also works:

```bash
node scripts/claude-call.mjs "<everything the user wrote after $claude>"
```

- Relay Claude's stdout as the primary answer. Avoid re-summarizing unless asked.
- If the command fails, report the failure briefly, including useful stderr.

## Grammar (owned by the wrapper — for your awareness only)

```text
/claude <prompt>                     default model + effort
/claude opus <prompt>                leading word picks the model
/claude sonnet low <prompt>          model + effort, any order
/claude repo <prompt>                Claude may read the repo (read-only) this call
/claude new [model] <prompt>         start a fresh conversation
/claude models                       list models/efforts, defaults marked
/claude use opus high                persist new defaults
/claude config                       show resolved config + session state
/claude -- <prompt>                  everything after -- is prompt (escape hatch)
```

Models: `fable`, `opus`, `sonnet`, `haiku`, or any `claude-*` id verbatim.
Efforts: `low`, `medium`, `high`, `xhigh` (default), `max`.

`$claude ...` is the explicit skill-invocation fallback if a Codex surface does
not expose skill slash commands.

## Memory

Conversations persist per project: consecutive `$claude` calls continue one
Claude session. The user says `new` to reset. You never manage session ids —
the wrapper does.
