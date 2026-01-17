FROM node:24

RUN curl -fsSL https://deno.land/install.sh | sh

ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

WORKDIR /app

COPY . .

RUN deno cache src/main.ts

EXPOSE 2481

CMD ["deno", "run", "-A", "src/main.ts"]
