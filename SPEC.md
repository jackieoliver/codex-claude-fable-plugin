# SPEC — Claude for Codex

Version 1.0 (agreed design, pre-implementation). Repo: `pizzacorruption/codex-claude-fable-plugin`.

## Product statement

One skill inside Codex chat that routes any turn to a Claude model of your choosing, with
persistent per-project conversation memory — plus an optional **native mode** that registers
Claude as a real Codex model provider. Dead simple: one word picks the model, zero config
required to start, no API key needed for the skill path.

## Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Architecture | **$claude skill IS the product.** Native provider mode is an experimental side quest (docs/native-mode.md), outside the main README path |
| 2 | Naming | Skill `$claude`, bin `codex-claude`, display name "Claude for Codex"; `$fable` kept as alias for `$claude fable` |
| 3 | Model picker | Leading-word grammar, no flags needed |
| 4 | Memory | Yes — one rolling conversation per project; `new` resets |
| 5 | Repo access | Pure chat by default; opt-in `repo` keyword grants read-only tools for that call |
| 6 | Output | The wrapper streams Claude stdout to the calling process; Codex relays the final visible answer. Native token streaming inside the Codex assistant bubble is **not guaranteed**. No JSON parsing, no stats footer |

## Components

| Piece | Path | Role |
|---|---|---|
| Primary skill | `skills/claude/SKILL.md` | `$claude` entry point; teaches Codex the grammar |
| Alias skill | `skills/fable/SKILL.md` | `$fable <prompt>` ≡ `$claude fable <prompt>` |
| Wrapper | `scripts/claude-call.mjs` (bin: `codex-claude`) | Grammar parsing, config/state, spawns `claude` CLI |
| Config | `.codex-claude/config.json` (gitignored) | `{ "model": "...", "effort": "..." }` |
| State | `.codex-claude/state.json` (gitignored) | `{ "sessionId": "<uuid>", "createdAt": "...", "lastModel": "..." }` |
| Run logs | `.codex-claude/runs/*.md` (gitignored) | Prompt/output/exit-code per call (debugging aid) |
| Native setup | `scripts/setup-native.mjs` | Writes/removes provider + profiles block in `~/.codex/config.toml` |
| Plugin manifest | `.codex-plugin/plugin.json` | Display name "Claude for Codex", updated prompts |

The old `skills/fable-config/`, `--mode` flag, `effort=`/`effort:` alternate syntaxes,
`.fable/` directory, and `FABLE_*` env vars are **removed**.

## Grammar

```text
$claude <prompt>                     default model + effort
$claude opus <prompt>                leading word = model
$claude sonnet low <prompt>          model + effort, any order
$claude repo <prompt>                this call may read the repo
$claude opus repo review my diff     keywords compose
$claude new [model] <prompt>         reset conversation, then answer
$claude models                       show models/efforts, current defaults marked
$claude use opus high                persist new defaults
$claude config                       show resolved config + session state
```

**Parsing rule:** consume leading tokens while they match a reserved word, in any order;
the first non-reserved token starts the prompt. `--` stops sniffing (for prompts that
genuinely begin with a reserved word: `$claude -- opus is a great model, right?`).

**Reserved words:**
- Models: `fable`, `opus`, `sonnet`, `haiku` — plus verbatim pass-through of any token
  starting with `claude-` (future-proof)
- Efforts: `low`, `medium`, `high`, `xhigh`, `max`
- Modifiers: `new`, `repo`
- Subcommands (first token only): `models`, `use`, `config`

**Resolution order** (model and effort each): per-call word → `CODEX_CLAUDE_MODEL` /
`CODEX_CLAUDE_EFFORT` env → `.codex-claude/config.json` → built-in (`fable` / `xhigh`).

## Memory

- One rolling conversation per project directory. Any `$claude` call continues it;
  switching models mid-conversation keeps the same thread (the Claude CLI supports
  changing `--model` on resume).
- **Mechanics (streaming-compatible, no output parsing):**
  - First call: wrapper mints a v4 UUID, runs `claude --session-id <uuid> ... -p <prompt>`,
    saves it to `state.json` only on exit code 0.
  - Later calls: `claude --resume <uuid> ... -p <prompt>`.
  - `new`: delete state, mint a fresh UUID.
  - Self-healing: if `--resume` fails (session purged, exit ≠ 0 with a resume error),
    the wrapper automatically starts a fresh session with a new UUID and retries once.
- `--no-session-persistence` is removed (memory requires persistence).

## Claude invocation

```bash
# default (pure chat)
claude --session-id <uuid> --model <model> --effort <effort> --safe-mode --tools "" -p "<prompt>"

# with `repo` keyword (read-only access)
claude --resume <uuid> --model <model> --effort <effort> --safe-mode \
       --allowedTools "Read" "Grep" "Glob" -p "<prompt>"
```

- `--safe-mode` stays default (no local Claude plugins/hooks/MCP load);
  `--allow-customizations` flag / `CODEX_CLAUDE_ALLOW_CUSTOMIZATIONS=1` opts out.
- `repo` = read-only file tools only (`Read`, `Grep`, `Glob`). No `Bash`, no writes.
  (v2 candidate: scoped `Bash(git diff:*)` for true diff review.)
- Output: stdout/stderr streamed through untouched. On non-zero exit, point at the run log.

## Native mode (experimental, opt-in)

`codex-claude setup-native`:
1. Requires `ANTHROPIC_API_KEY` in the environment — **the key itself is never written to
   any file**; the config references `env_key` only.
2. Appends a clearly-marked block (`# >>> codex-claude native >>>` … `# <<<`) to
   `~/.codex/config.toml`:
   - `[model_providers.anthropic]` → `base_url = "https://api.anthropic.com/v1"`,
     `env_key = "ANTHROPIC_API_KEY"`, `wire_api = "chat"` (Anthropic's OpenAI-compat endpoint)
   - Profiles: `claude-fable` → `claude-fable-5`, `claude-opus` → `claude-opus-4-8`,
     `claude-sonnet` → `claude-sonnet-5`, `claude-haiku` → `claude-haiku-4-5-20251001`
3. Prints usage: `codex --profile claude-opus`, or `/model` inside Codex.

`codex-claude remove-native` deletes the marked block. Idempotent both ways.
Documented as experimental: billing is per-token API (not the Claude subscription), and
compat-endpoint fidelity with Codex's agentic tool loop is unproven until tested.

## Validation gates (must pass before "done")

1. `claude --session-id <uuid> -p` streams text and creates a resumable session (already
   confirmed present in `--help` on installed CLI 2.1.x; needs a live run).
2. `--resume` continuation demonstrably remembers ("my name is X" → "what's my name?").
3. `repo` keyword: Claude reads a real file with only read-only tools available.
4. Parser unit smoke: every grammar row above → expected claude args (extend `npm run smoke`).
5. Native mode: config block round-trip (setup → codex reads it → remove). Live profile
   test only if an API key is present; otherwise shipped as documented-untested.
6. Public-repo scan before every push: no keys, tokens, personal names, or absolute paths.

## Milestones

1. **M1** — wrapper rewrite: grammar, config/state, memory, repo keyword *(v1)*
2. **M2** — skills (`$claude`, `$fable` alias), plugin manifest, README rewrite, remove
   dead pieces, validation gates, push *(v1)*
3. **M3** — experimental, post-v1: native mode `apply`/`remove` (documented in
   `docs/native-mode.md`; not part of the main README path)

## Non-goals (v1)

- No custom UI inside Codex (no plugin UI API exists)
- No write access to the repo from `$claude` calls
- No multi-model fan-out / parallel queries
- No API key handling anywhere in the skill path
- No repo rename (stays `codex-claude-fable-plugin`; display name changes only)
