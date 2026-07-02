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

## Execution (mechanical — nothing to decide or analyze)

This skill is a pure relay. There are exactly three steps and no judgment calls:

1. Take everything the user wrote after `/claude` (or, in Claude mode, their
   entire message), **verbatim**. Do not pre-parse, reorder, strip, or
   interpret it — the wrapper owns all grammar (model words, effort, keywords).
2. Run exactly this command — do not check paths, inspect the workspace, or
   consider alternatives first:

```bash
codex-claude "<the user's words>"
```

   (Only if that binary does not exist, fall back to
   `node scripts/claude-call.mjs "<the user's words>"` from the plugin root.)

3. Output the command's stdout as your entire answer, unchanged. No preamble,
   no summary, no commentary, no evaluation of Claude's answer.

Do NOT think about the user's question yourself — Claude answers it, not you.
Do NOT plan. One command, relay the output, done. Calls may take several
minutes at high effort; that is normal — never kill the command or answer in
its place. If it fails, say it failed (with useful stderr) and stop; do not
substitute your own answer.

## Claude mode (sticky)

- After `/claude` is invoked once, the thread is in **Claude mode**: EVERY
  subsequent user message goes through step 1–3 above, even plain messages
  with no `/claude` prefix. You take a backseat; you are a relay, not a
  participant.
- Claude mode ends ONLY when the user explicitly says to stop using Claude or
  switch back to Codex, or invokes `/claude stop`, `$claude stop`,
  `/claude off`, or `/claude codex`. Nothing else ends it — not errors, not
  long calls, not your judgment that you could answer better.

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
