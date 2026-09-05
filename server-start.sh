#!/bin/bash
# Spustí opendraw-bun server (apps/server/src/index.ts) na pozadí.
# Použití: ./server-start.sh [--port XXXX] [--public] [--help]
#   --port XXXX  port serveru (default 3001)
#   --public     host 0.0.0.0 (default je localhost)
#   --help       zobrazí nápovědu
#
# PORT/HOST se serveru předávají přes env. PID a log patří do /tmp.
# Žádné absolutní cesty (kromě /tmp) – root repa se odvodí z umístění skriptu.

set -u

PORT="3001"
HOST="localhost"

usage() {
  echo "Použití: $0 [--port XXXX] [--public] [--help]"
  echo ""
  echo "  --port XXXX  port serveru (default 3001)"
  echo "  --public     nastaví host na 0.0.0.0 (default je localhost)"
  echo "  --help       zobrazí tuto nápovědu"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      if [[ -z "${2:-}" ]]; then
        echo "Chyba: --port vyžaduje hodnotu." >&2
        usage >&2
        exit 1
      fi
      if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "Chyba: port musí být číslo, dostal jsem: $2" >&2
        exit 1
      fi
      PORT="$2"
      shift 2
      ;;
    --public)
      HOST="0.0.0.0"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Chyba: neznámý argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$HOST" == "0.0.0.0" ]]; then
  DISPLAY_HOST="localhost"
else
  DISPLAY_HOST="$HOST"
fi

PID_FILE="/tmp/opendraw-bun-server.pid"
LOG_FILE="/tmp/opendraw-bun-server.log"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE")"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Server už běží (PID $OLD_PID). Nejprve ho zastav: ./server-stop.sh" >&2
    exit 1
  fi
fi

# Root repa = adresář tohoto skriptu (žádné absolutní cesty).
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

echo "Starting opendraw-bun server on port $PORT (host $HOST)..."
PORT="$PORT" HOST="$HOST" nohup bun apps/server/src/index.ts > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
echo "Server PID: $SERVER_PID (log: $LOG_FILE)"
echo ""
echo "Server: http://$DISPLAY_HOST:$PORT"
if [[ "$HOST" == "0.0.0.0" ]]; then
  echo "(veřejný režim – poslouchá na 0.0.0.0)"
fi
echo ""
echo "Zastavení: ./server-stop.sh"
