FROM denoland/deno:2.6.5

WORKDIR /app

COPY . .

RUN deno cache src/main.ts

EXPOSE 2481

CMD ["run", "-A", "src/main.ts"]
