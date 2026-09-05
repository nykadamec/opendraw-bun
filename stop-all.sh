#!/bin/bash
# Zastaví dev procesy (server, desktop, mobile) podle přesných PID souborů.
# Použití: ./stop-all.sh [--help]
#
# Čte /tmp/opendraw-bun-dev.{server,desktop,mobile}.pid, pošle SIGTERM,
# po ~5 s případně SIGKILL. Zastaralé/prázdné PID soubory uklidí.
# Žádné pkill – jen přesné PIDy.

set -u

usage() {
  echo "Použití: $0 [--help]"
  echo ""
  echo "  Zastaví dev procesy podle PID souborů:"
  echo "    /tmp/opendraw-bun-dev.server.pid"
  echo "    /tmp/opendraw-bun-dev.desktop.pid"
  echo "    /tmp/opendraw-bun-dev.mobile.pid"
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

PID_FILES=(
  "/tmp/opendraw-bun-dev.server.pid"
  "/tmp/opendraw-bun-dev.desktop.pid"
  "/tmp/opendraw-bun-dev.mobile.pid"
)

stopped=0
already=0

stop_one() {
  local pid_file="$1"
  local name
  name="$(basename "$pid_file" .pid)"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name: neběží (PID soubor neexistuje)."
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -z "$pid" ]]; then
    echo "$name: PID soubor je prázdný – mažu $pid_file."
    rm -f "$pid_file"
    return 0
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$name: proces $pid už neběží – mažu zastaralý PID soubor."
    rm -f "$pid_file"
    return 0
  fi

  echo "$name: zastavuji proces $pid (SIGTERM)..."
  kill "$pid"

  for _ in 1 2 3 4 5; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "$name: proces se neukončil, posílám SIGKILL..."
    kill -9 "$pid"
  fi

  rm -f "$pid_file"
  echo "$name: zastaven."
}

for f in "${PID_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    pid="$(cat "$f")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      stopped=$((stopped + 1))
    else
      already=$((already + 1))
    fi
  else
    already=$((already + 1))
  fi
  stop_one "$f"
done

echo "Hotovo: zastaveno $stopped, ostatní ne běžely ($already)."
