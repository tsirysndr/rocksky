FROM docker.io/cloudflare/sandbox:0.7.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client

# Required during local development to access exposed ports
EXPOSE 8080
