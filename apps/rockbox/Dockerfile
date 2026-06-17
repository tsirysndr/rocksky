# syntax=docker/dockerfile:1

FROM --platform=linux/amd64 golang:1.24-alpine AS builder
WORKDIR /src
COPY container_src/ .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o proxy .

FROM tsiry/rockbox:latest
COPY --from=builder /src/proxy /usr/local/bin/proxy
RUN printf '#!/bin/sh\n/usr/local/bin/proxy &\nexec /usr/local/bin/entrypoint.sh\n' > /start.sh && chmod +x /start.sh
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

