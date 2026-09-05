#!/bin/bash
# Zastaví opendraw-bun server podle PID souboru v /tmp.
# Použití: ./server-stop.sh [--help]

set -u

usage() {
  echo "Použití: $0 [--help]"
  echo ""
  echo "  Zastaví server podle PID souboru /tmp/opendraw-bun-server.pid."
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  echo "Chyba: neznámý argument: $1" >&2
  usage >&2
  exit 1
fi

PID_FILE="/tmp/opendraw-bun-server.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Server neběží (PID soubor $PID_FILE neexistuje)."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if [[ -z "$PID" ]]; then
  echo "PID soubor je prázdný – mažu $PID_FILE."
  rm -f "$PID_FILE"
  exit 0
fi

if ! kill -0 "$PID" 2>/dev/null; then
  echo "Proces $PID už neběží – mažu zastaralý PID soubor."
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping server (PID $PID)..."
kill "$PID"

# Dej procesu chvilku na ukončení, pak přitvrď.
for _ in 1 2 3 4 5; do
  kill -0 "$PID" 2>/dev/null || break
  sleep 1
done

if kill -0 "$PID" 2>/dev/null; then
  echo "Proces se neukončil, posílám SIGKILL..."
  kill -9 "$PID"
fi

rm -f "$PID_FILE"
echo "Server zastaven."
