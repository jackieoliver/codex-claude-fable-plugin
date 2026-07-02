# Claude for Codex

Call Claude models from Codex chat with one command. Say nothing extra and a
router picks the right model for the prompt; name a model to override. Keeps a
conversation going across calls, and reads your repo only when you say so.
Uses your existing Claude Code CLI login — **no API key**.

```text
/claude why would a mutex deadlock here?        ← router picks the model
/claude opus high review my plan                ← or you do
```

## Requirements

- Codex CLI or Codex app with plugin support
- [Claude Code CLI](https://claude.com/claude-code) installed and authenticated (`claude --version`)
- Node.js 18+

## Install

```bash
git clone https://github.com/jackieoliver/codex-claude-fable-plugin.git
cd codex-claude-fable-plugin
npm link                                  # provides the codex-claude binary
codex plugin marketplace add "$(pwd)"
```

Open Codex, run `/plugins`, install **Claude for Codex**, and start a new thread.
Type `/claude` to invoke the skill from the slash command menu.

## Usage

```text
/claude <prompt>                     auto: router picks model + effort from the prompt
/claude opus <prompt>                leading word picks the model (no routing)
/claude sonnet low <prompt>          model + effort, any order
/claude repo <prompt>                Claude may read the repo (read-only) this call
/claude new [model] <prompt>         start a fresh conversation
/claude models                       list models/efforts, defaults marked
/claude use opus high                pin defaults (use auto to re-enable routing)
/claude config                       show resolved config + session state
/claude -- <prompt>                  everything after -- is prompt (escape hatch)
```

- **Models:** `auto` (default), `fable`, `opus`, `sonnet`, `haiku` — or any
  `claude-*` model id verbatim.
- **Efforts:** `low`, `medium`, `high`, `xhigh`, `max`.
- `$claude ...` remains the explicit skill-invocation fallback on surfaces
  where Codex doesn't expose skill slash commands.

## Auto-routing

With no model word, a fast haiku call reads your prompt and picks the model and
effort — trivial lookups land on `haiku low`, the hardest reasoning lands on
`fable xhigh`, everything else in between. The decision is echoed as
`[claude] auto-router → <model> <effort>` so it's never a mystery. If routing
fails, the call falls back to `fable xhigh`. An effort you name always beats
the router's; naming a model skips the router entirely.

## Memory

Conversations persist per project: consecutive `/claude` calls continue one
Claude session (model switches keep the thread). Say `new` to start over.
Session state lives in `.codex-claude/state.json` (gitignored); no ids to manage.

## Repo access

By default Claude answers in pure chat mode and cannot see your files. Add the
`repo` keyword to grant **read-only** tools (`Read`, `Grep`, `Glob`) for that
call — never writes, never shell:

```text
/claude opus repo review the error handling in scripts/claude-call.mjs
```

## Isolation

Calls run with Claude's `--safe-mode`, so your local Claude plugins, hooks, and
MCP servers are not loaded. Opt out per call with `--allow-customizations` or
`CODEX_CLAUDE_ALLOW_CUSTOMIZATIONS=1`.

## Defaults and overrides

Resolution order for model and effort:

1. Words in the call (`/claude opus high ...`)
2. `CODEX_CLAUDE_MODEL` / `CODEX_CLAUDE_EFFORT` environment variables
3. `.codex-claude/config.json` (written by `/claude use ...`)
4. Built-ins: `auto` (router) / `xhigh`

## Troubleshooting

- Every call writes a log to `.codex-claude/runs/` with the prompt, output, and
  exit code.
- Dry-run any call to see the exact `claude` command without running it:

```bash
codex-claude --dry-run "opus high review my plan"
```

- Parser self-test: `npm run smoke`

## Output note

The wrapper streams Claude stdout to the calling process; Codex relays the
final visible answer in chat. Native token streaming inside the Codex assistant
bubble is not guaranteed.

## Experimental: native provider mode

There is a separate, experimental path that registers Claude as a real Codex
model provider (Codex's own `/model` picker, API-key billing). It is **not**
part of this plugin's supported surface — see [docs/native-mode.md](docs/native-mode.md).

## Public safety

This repository contains no API keys, tokens, or local state. `.gitignore`
excludes `.codex-claude/`, `.claude/`, `.codex/`, `.fable/`, `.env*`, logs, and
local overrides.
