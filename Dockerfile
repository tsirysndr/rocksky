FROM node:22

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

EXPOSE 8000

EXPOSE 3004

CMD ["turbo", "db:migrate", "prod:all", "--filter=@rocksky/api"]