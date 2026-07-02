---
name: claude
description: Call a Claude model (fable, opus, sonnet, haiku) from Codex chat with a word-based model picker, effort selection, and per-project conversation memory. Use when the user invokes /claude or $claude, names a Claude model, or asks for Claude's take inside Codex.
---

# Claude for Codex

Use this skill when the user invokes `/claude` or `$claude`, names a Claude model, or wants a
Claude answer inside Codex chat. After the user invokes `/claude`, treat the
thread as being in Claude mode and keep routing later user turns through this
skill until the user asks to stop, switch back to Codex, or invokes `/claude
stop`.

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
- `/claude` is sticky in the conversation: after a successful Claude call,
  default to calling Claude for subsequent user turns in the same thread.
- Stop sticky mode only when the user explicitly says to stop using Claude,
  switch back to Codex, or uses `/claude stop`, `$claude stop`, `/claude off`,
  or `/claude codex`.

## Grammar (owned by the wrapper — for your awareness only)

```text
/claude <prompt>                     auto: conservative router; fable unless obviously smaller
/claude opus <prompt>                leading word picks the model (no routing)
/claude sonnet low <prompt>          model + effort, any order
/claude repo <prompt>                Claude may read the repo (read-only) this call
/claude new [model] <prompt>         start a fresh conversation
/claude models                       list models/efforts, defaults marked
/claude use opus high                pin defaults (use auto to re-enable routing)
/claude config                       show resolved config + session state
/claude on                           mark Claude mode active
/claude stop                         stop Claude mode; return future turns to Codex
/claude -- <prompt>                  everything after -- is prompt (escape hatch)
```

Models: `auto` (default), `fable`, `opus`, `sonnet`, `haiku`, or any `claude-*` id verbatim.
Efforts: `low`, `medium`, `high`, `xhigh`, `max`.

## Routing

With no model word, a fast haiku router reads the prompt, keeps `fable` as the
default, and chooses a smaller model only when the prompt is obviously suited
to one. If the prompt is ambiguous, open-ended, architectural, or asks for hard
reasoning, it stays on `fable`. When no effort was named anywhere, the routed
model brings a matching one (`haiku → low`, `sonnet → high`, `opus`/`fable →
`xhigh`); a named/env/config effort always wins. The chosen route is echoed
on stderr as `[claude] auto-router → <model> <effort>`. Naming a model skips
the router entirely; naming an effort keeps that effort for the call. `use
<model>` pins one persistently; `use auto` re-enables routing.

`$claude ...` is the explicit skill-invocation fallback if a Codex surface does
not expose skill slash commands.

## Memory

Conversations persist per project: consecutive `$claude` calls continue one
Claude session. The user says `new` to reset. You never manage session ids —
the wrapper does.
