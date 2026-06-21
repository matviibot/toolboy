#!/usr/bin/env bash
# toolboy — bring up everything locally: the backend relay (Wrangler, :8787)
# and the web shell (Vite, :5173). Ctrl+C tears both down.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\033[1;36m[toolboy]\033[0m %s\n' "$1"; }

# 1. Dependencies (only if missing).
[ -d node_modules ]         || { log "installing web deps…";     npm install; }
[ -d backend/node_modules ] || { log "installing backend deps…"; (cd backend && npm install); }

# 2. Local discovery DB (idempotent — CREATE TABLE IF NOT EXISTS).
log "applying local D1 schema…"
(cd backend && npm run --silent db:local) >/dev/null

# 3. Run both dev servers; kill the whole group on exit.
pids=()
cleanup() { log "shutting down…"; for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

log "starting backend relay → http://localhost:8787"
(cd backend && npm run --silent dev) & pids+=($!)

log "starting web shell    → http://localhost:5173"
npm run --silent dev & pids+=($!)

wait
