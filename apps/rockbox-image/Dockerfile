# syntax=docker/dockerfile:1

FROM --platform=linux/amd64 golang:1.24-alpine AS builder
WORKDIR /src
COPY container_src/ .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o proxy .

FROM tsiry/rockbox:latest
COPY --from=builder /src/proxy /usr/local/bin/proxy

# /start.sh runs the Go proxy in the background and rockbox in the foreground.
# When rockbox dies (panic, OOM, whatever) we kill the proxy and exit with
# rockbox's status, so the container dies cleanly. Fly's `restart: always`
# policy then recreates the machine — without this the proxy stays up,
# Fly thinks the machine is healthy, and every request hangs on
# "upstream not ready" forever.
RUN cat > /start.sh <<'EOF' && chmod +x /start.sh
#!/bin/sh
set -u
/usr/local/bin/proxy &
PROXY_PID=$!
trap 'kill -TERM "$PROXY_PID" 2>/dev/null; wait "$PROXY_PID" 2>/dev/null; exit' INT TERM
/usr/local/bin/entrypoint.sh
STATUS=$?
echo "start.sh: rockboxd exited with status $STATUS — taking down container"
kill -TERM "$PROXY_PID" 2>/dev/null
wait "$PROXY_PID" 2>/dev/null
exit "$STATUS"
EOF
ENTRYPOINT ["/start.sh"]

# proxy
EXPOSE 8080
# rockboxd ports
EXPOSE 6061
EXPOSE 6062
EXPOSE 6063
EXPOSE 6600
# CMAF (HLS + DASH) — default audio output, played directly in the browser
EXPOSE 7882
# snapserver: client protocol, HTTP stream, HTTP JSON API
EXPOSE 1704
EXPOSE 1705
EXPOSE 1780
# navidrome
EXPOSE 4533

