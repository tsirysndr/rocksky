FROM node:24

RUN curl -fsSL https://deno.land/install.sh | sh

ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

RUN deno x drizzle-kit --version

WORKDIR /app

COPY . .

RUN deno cache src/main.ts

EXPOSE 2481

CMD ["bash", "-c", "deno x drizzle-kit migrate && deno run -A src/main.ts"]
