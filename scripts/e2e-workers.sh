#!/usr/bin/env bash
# Runs the @smoke tests against the web app on the Workers runtime (the OpenNext preview), the
# runtime staging uses. `make e2e` only covers `next start` on Node, which let a Worker crash
# reach staging. The `ci` env in web/wrangler.jsonc reaches the Go API through API_BASE_URL.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
api_port=8080
preview_port=8787

kill_tree() {
  local child
  for child in $(pgrep -P "$1" || true); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
cleanup() {
  [[ -n "${preview_pid:-}" ]] && kill_tree "$preview_pid"
  [[ -n "${api_pid:-}" ]] && kill_tree "$api_pid"
}
trap cleanup EXIT

wait_for() {
  for _ in $(seq 1 90); do
    curl -sf -o /dev/null "$1" && return 0
    sleep 1
  done
  echo "Timed out waiting for $1" >&2
  return 1
}

(cd "$root/api" && PORT=$api_port go run ./cmd/api) &
api_pid=$!

(cd "$root/web" && pnpm exec opennextjs-cloudflare build)

(cd "$root/web" && pnpm exec opennextjs-cloudflare preview --port "$preview_port" --env ci) &
preview_pid=$!

wait_for "http://localhost:$api_port/healthz"
wait_for "http://localhost:$preview_port/api/healthz"

# Its own report folder, so this run does not wipe the report from `make e2e` in CI.
BASE_URL="http://localhost:$preview_port" PLAYWRIGHT_HTML_OUTPUT_DIR="$root/e2e/playwright-report-workers" \
  pnpm -C "$root/e2e" exec playwright test --grep @smoke
