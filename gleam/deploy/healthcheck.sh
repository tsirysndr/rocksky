#!/bin/bash
# Restart the XRPC API when it stops answering HTTP while systemd still sees it
# as active.
#
# The process can wedge its event loop without ever exiting -- node-cron did
# exactly this across the October 2026 DST fall-back, filling the listen
# backlog so every connection hung for hours. Restart=on-failure cannot catch
# that, because from systemd's side nothing failed.
set -uo pipefail

UNIT=rocksky-gleam-xrpc.service
URL=http://127.0.0.1:3004/xrpc/_health

FAIL_THRESHOLD=3    # consecutive failed probes before restarting
PROBE_TIMEOUT=10    # seconds to allow one probe
GRACE_SEC=600       # quiet period after the unit goes active (it builds first)
MIN_RESTART_GAP=900 # never restart more often than this

STATE=/run/rocksky-gleam-xrpc-healthcheck
FAIL_FILE="$STATE/failures"
LAST_RESTART="$STATE/last-restart"
mkdir -p "$STATE"

# Only babysit a unit systemd believes is up, so a deliberate stop stays stopped.
if [[ "$(systemctl is-active "$UNIT")" != "active" ]]; then
  rm -f "$FAIL_FILE"
  exit 0
fi

now=$(date +%s)

# ExecStartPre builds before the port is bound, so a fresh start is not a
# failure. Both sides are epoch seconds, so the arithmetic survives a DST jump.
active_ts=$(systemctl show -p ActiveEnterTimestamp --value "$UNIT")
active_epoch=$(date -d "$active_ts" +%s 2>/dev/null || echo 0)
if ((active_epoch > 0 && now - active_epoch < GRACE_SEC)); then
  exit 0
fi

if curl -sS -f -m "$PROBE_TIMEOUT" -o /dev/null "$URL"; then
  rm -f "$FAIL_FILE"
  exit 0
fi

failures=$(($(cat "$FAIL_FILE" 2>/dev/null || echo 0) + 1))
echo "$failures" >"$FAIL_FILE"
echo "health probe failed ($failures/$FAIL_THRESHOLD): $URL"
((failures < FAIL_THRESHOLD)) && exit 0

# Rate-limit so a service that wedges on every boot is not hammered.
last=$(cat "$LAST_RESTART" 2>/dev/null || echo 0)
if ((now - last < MIN_RESTART_GAP)); then
  echo "restart suppressed: last restart was $((now - last))s ago"
  exit 0
fi

echo "$now" >"$LAST_RESTART"
rm -f "$FAIL_FILE"
echo "restarting $UNIT after $failures failed probes"
systemctl restart "$UNIT"
