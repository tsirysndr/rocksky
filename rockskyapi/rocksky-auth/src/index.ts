import { isValidHandle } from "@atproto/syntax";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import jwt from "jsonwebtoken";
import { createAgent } from "lib/agent";
import { createBidirectionalResolver, createIdResolver } from "lib/idResolver";
import sqliteKv from "sqliteKv";
import { createStorage } from "unstorage";
import { URLSearchParams } from "url";
import { createClient } from "./auth/client";
import { createDb, migrateToLatest } from "./db";
import * as Profile from "./lexicon/types/app/bsky/actor/profile";
import { env } from "./lib/env";

type Session = { did: string };

const app = new Hono();

const { DB_PATH } = env;
const db = createDb(DB_PATH);
await migrateToLatest(db);

const kv = createStorage({
  driver: sqliteKv({ location: env.KV_DB_PATH, table: "kv" }),
});

const baseIdResolver = createIdResolver(kv);

const ctx = {
  oauthClient: await createClient(db),
  resolver: createBidirectionalResolver(baseIdResolver),
  kv: new Map<string, string>(),
};

app.use(cors());

app.post("/login", async (c) => {
  const { handle, cli } = await c.req.json();
  if (typeof handle !== "string" || !isValidHandle(handle)) {
    c.status(400);
    return c.text("Invalid handle");
  }

  try {
    const url = await ctx.oauthClient.authorize(handle, {
      scope: "atproto transition:generic",
    });

    if (cli) {
      ctx.kv.set(`cli:${handle}`, "1");
    }

    return c.redirect(url);
  } catch (e) {
    c.status(500);
    return c.text(e.toString());
  }
});

app.get("/oauth/callback", async (c) => {
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  let did, cli;

  try {
    const { session } = await ctx.oauthClient.callback(params);
    did = session.did;
    const handle = await ctx.resolver.resolveDidToHandle(did);
    cli = ctx.kv.get(`cli:${handle}`);
    ctx.kv.delete(`cli:${handle}`);

    const token = jwt.sign({ did }, env.JWT_SECRET);
    ctx.kv.set(did, token);
  } catch (err) {
    console.error({ err }, "oauth callback failed");
    return c.redirect(`${env.FRONTEND_URL}?error=1`);
  }

  if (!cli) {
    return c.redirect(`${env.FRONTEND_URL}?did=${did}`);
  }

  return c.redirect(`${env.FRONTEND_URL}?did=${did}&cli=${cli}`);
});

app.get("/", async (c) => {
  return c.json({ status: "ok" });
});

app.get("/profile", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const agent = await createAgent(ctx.oauthClient, did);

  if (!agent) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { data: profileRecord } = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: "app.bsky.actor.profile",
    rkey: "self",
  });
  const handle = await ctx.resolver.resolveDidToHandle(did);
  const profile =
    Profile.isRecord(profileRecord.value) &&
    Profile.validateRecord(profileRecord.value).success
      ? { ...profileRecord.value, handle }
      : {};
  return c.json(profile);
});

app.get("/client-metadata.json", async (c) => {
  return c.json(ctx.oauthClient.clientMetadata);
});

app.get("/token", async (c) => {
  const did = c.req.header("session-did");

  if (typeof did !== "string" || !did || did === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const token = ctx.kv.get(did);
  if (!token) {
    c.status(401);
    return c.text("Unauthorized");
  }

  ctx.kv.delete(did);

  return c.json({ token });
});

serve({
  fetch: app.fetch,
  port: 8000,
});
