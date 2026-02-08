FROM node:24-slim

COPY --from=docker.io/cloudflare/sandbox:0.7.0 /container-server/sandbox /sandbox

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    git \
    curl \
    ca-certificates

RUN curl -fsSL https://openclaw.ai/install.sh | bash || true

RUN npm install -g @anthropic-ai/claude-code pm2

WORKDIR /workspace

# Required during local development to access exposed ports
EXPOSE 8080
EXPOSE 3000
EXPOSE 18789

ENTRYPOINT ["/sandbox"]
