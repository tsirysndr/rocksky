FROM node:22 AS builder

RUN apt-get update && apt-get install -y curl

RUN curl -fsSL https://bun.sh/install | bash

RUN npm install -g turbo

ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY ./apps ./apps

COPY ./crates ./crates

COPY ./package.json ./package.json

COPY ./bun.lock ./bun.lock

COPY ./turbo.json ./turbo.json

RUN bun install

ARG VITE_API_URL

ENV VITE_API_URL=$VITE_API_URL

RUN turbo build --filter=@rocksky/web

FROM caddy:alpine

COPY --from=builder /app/apps/web/dist /usr/share/caddy

COPY ./apps/web/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]