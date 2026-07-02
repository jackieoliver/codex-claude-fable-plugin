#!/bin/sh
# Refresh the Codex plugin cache snapshot from this checkout (local marketplace).
# Wrapper *code* is live via the npm-linked codex-claude binary; this refresh is
# only needed when skills/ or the plugin manifest change.
set -e
codex plugin add "codex-claude-fable-plugin@codex-claude-fable-plugin" >/dev/null
echo "[codex-claude] Codex plugin cache refreshed"
