import { Hono } from "@hono/hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text(
    `
This is a feed generator for the "rocksky.app" application.
Learn more at https://tangled.org/rocksky.app/rocksky

Most API routes are under /xrpc/

		`,
  );
});

app.get("/xrpc/_health", (c) => {
  const version = Deno.env.get("COMMIT_SHA") ?? "unknown";
  return c.json({ version });
});

export default app;
