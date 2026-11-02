#!/usr/bin/env bash
# Starts four ElysianDB servers for the integration tests, one per authentication mode:
#   none  http://127.0.0.1:18089
#   token http://127.0.0.1:18090 (token: test-token)
#   basic http://127.0.0.1:18091
#   user  http://127.0.0.1:18092
# The admin password of the basic and user servers is admin-password-123.
#
# Usage: scripts/start-test-servers.sh /path/to/elysiandb [work-dir]
# Then:  npm run test:integration:local
# Stop:  kill $(cat <work-dir>/*.pid)
set -euo pipefail

BIN="${1:?usage: $0 /path/to/elysiandb [work-dir]}"
WORK="${2:-$(mktemp -d)}"
mkdir -p "$WORK"

for entry in none:18089 token:18090 basic:18091 user:18092; do
  mode="${entry%%:*}"
  port="${entry##*:}"
  mkdir -p "$WORK/data-$mode"
  if [ "$mode" = none ]; then
    auth="enabled: false"
  else
    auth="enabled: true
    mode: $mode
    token: test-token"
  fi

  cat > "$WORK/$mode.yaml" <<YAML
store:
  folder: $WORK/data-$mode
  shards: 64
  flushIntervalSeconds: 5
  crashRecovery: { enabled: false, maxLogMB: 100 }
server:
  http: { enabled: true, host: 127.0.0.1, port: $port }
  tcp: { enabled: false, host: 127.0.0.1, port: 0 }
log:
  level: info
  bufferLines: 5000
stats:
  enabled: true
security:
  authentication:
    $auth
api:
  schema: { enabled: true, strict: true }
  index: { workers: 2 }
  cache: { enabled: true, cleanupIntervalSeconds: 10 }
  hooks: { enabled: true }
adminui:
  enabled: false
monitoring:
  prometheus: { enabled: true }
YAML

  ELYSIANDB_ADMIN_PASSWORD=admin-password-123 "$BIN" --config "$WORK/$mode.yaml" server > "$WORK/$mode.log" 2>&1 &
  echo $! > "$WORK/$mode.pid"
done

for port in 18089 18090 18091 18092; do
  for _ in $(seq 1 50); do
    curl -fs "http://127.0.0.1:$port/health" > /dev/null && break
    sleep 0.2
  done
  curl -fs "http://127.0.0.1:$port/health" > /dev/null || { echo "server on port $port did not start"; cat "$WORK"/*.log; exit 1; }
done

echo "ElysianDB test servers are running (logs and pid files in $WORK)"
