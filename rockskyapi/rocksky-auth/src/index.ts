import { isValidHandle } from "@atproto/syntax";
import { serve } from "@hono/node-server";
import { equals } from "@xata.io/client";
import { ctx } from "context";
import { Hono } from "hono";
import { cors } from "hono/cors";
import jwt from "jsonwebtoken";
import { createAgent } from "lib/agent";
import {
  getLovedTracks,
  likeTrack,
  unLikeTrack,
} from "lovedtracks/lovedtracks.service";
import { scrobbleTrack } from "nowplaying/nowplaying.service";
import { trackSchema } from "types/track";
import { URLSearchParams } from "url";
import * as Profile from "./lexicon/types/app/bsky/actor/profile";
import { env } from "./lib/env";

type Session = { did: string };

const app = new Hono();

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

  if (profile.handle) {
    try {
      await ctx.client.db.users.create({
        did,
        handle,
        display_name: profile.displayName,
        avatar: `https://cdn.bsky.app/img/avatar/plain/${did}/${profile.avatar.ref.toString()}@jpeg`,
      });
    } catch (e) {
      if (!e.message.includes("invalid record: column [did]: is not unique")) {
        console.error(e.message);
      }
    }
  }

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

app.post("/now-playing", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const body = await c.req.json();
  const parsed = trackSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid track data: " + parsed.error.message);
  }
  const track = parsed.data;
  await scrobbleTrack(ctx, track, user);

  return c.json({ status: "ok" });
});

app.post("/likes", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const body = await c.req.json();
  const parsed = trackSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid track data: " + parsed.error.message);
  }
  const track = parsed.data;
  await likeTrack(ctx, track, user);

  return c.json({ status: "ok" });
});

app.delete("/likes/:sha256", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const sha256 = c.req.param("sha256");
  await unLikeTrack(ctx, sha256, user);
  return c.json({ status: "ok" });
});

app.get("/likes", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const size = +c.req.param("size") || 10;
  const offset = +c.req.param("offset") || 0;

  const lovedTracks = await getLovedTracks(ctx, user, size, offset);
  return c.json(lovedTracks);
});

app.get("/scrobbles", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const size = +c.req.param("size") || 10;
  const offset = +c.req.param("offset") || 0;

  const scrobbles = await ctx.client.db.scrobbles
    .filter("user_id", equals(user.xata_id))
    .sort("xata_createdat", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });

  return c.json(scrobbles.records);
});

serve({
  fetch: app.fetch,
  port: 8000,
});
