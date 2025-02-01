import { isValidHandle } from "@atproto/syntax";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { URLSearchParams } from "url";
import { createClient } from "./auth/client";
import { createDb, migrateToLatest } from "./db";
import { env } from "./lib/env";

type Session = { did: string };

// Start a Hono app
const app = new Hono();

const { DB_PATH } = env;
const db = createDb(DB_PATH);
await migrateToLatest(db);

const ctx = {
  oauthClient: await createClient(db),
};

app.use(cors());

app.post("/login", async (c) => {
  const { handle } = await c.req.json();
  if (typeof handle !== "string" || !isValidHandle(handle)) {
    c.status(400);
    return c.text("Invalid handle");
  }

  try {
    const url = await ctx.oauthClient.authorize(handle, {
      scope: "atproto transition:generic",
    });
    return c.redirect(url);
  } catch (e) {
    c.status(500);
    return c.text(e.toString());
  }
});

app.get("/oauth/callback", async (c) => {
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  try {
    const { session, state } = await ctx.oauthClient.callback(params);
    console.log({ params, session, state });
  } catch (err) {
    console.error({ err }, "oauth callback failed");
    return c.redirect("/?error");
  }
  return c.redirect("/");
});

app.get("/", async (c) => {
  return c.json({ status: "ok" });
});

serve({
  fetch: app.fetch,
  port: 8000,
});
