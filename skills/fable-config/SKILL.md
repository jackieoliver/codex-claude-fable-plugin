---
name: fable-config
description: Inspect or change the default Claude Fable effort used by the codex-fable wrapper.
---

# Claude Fable Config

Use this skill when the user wants to inspect or change Claude Fable defaults.

## Default Effort

Show current resolved config:

```bash
codex-fable --show-config
```

Set default effort:

```bash
codex-fable --set-default-effort <low|medium|high|xhigh|max>
```

The project default is stored in `.fable/config.json`.

In this plugin development checkout, use `node scripts/fable-call.mjs` instead of `codex-fable` if the package has not been linked yet.
