import { BlobRef } from "@atproto/lexicon";
import { isValidHandle } from "@atproto/syntax";
import { equals } from "@xata.io/client";
import { ctx } from "context";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import * as Profile from "lexicon/types/app/bsky/actor/profile";
import { createAgent } from "lib/agent";
import { env } from "lib/env";
import users from "schema/users";

const app = new Hono();

app.get("/login", async (c) => {
  const { handle, cli } = c.req.query();
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
    return c.redirect(url.toString());
  } catch (e) {
    c.status(500);
    return c.text(e.toString());
  }
});

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

    return c.text(url.toString());
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

    const token = jwt.sign(
      { did, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
      env.JWT_SECRET
    );
    ctx.kv.set(did, token);
  } catch (err) {
    console.error({ err }, "oauth callback failed");
    return c.redirect(`${env.FRONTEND_URL}?error=1`);
  }

  const spotifyUser = await ctx.client.db.spotify_accounts
    .filter("user_id.did", equals(did))
    .filter("is_beta_user", equals(true))
    .getFirst();

  if (spotifyUser?.email) {
    ctx.nc.publish("rocksky.spotify.user", Buffer.from(spotifyUser.email));
  }

  if (!cli) {
    return c.redirect(`${env.FRONTEND_URL}?did=${did}`);
  }

  return c.redirect(`${env.FRONTEND_URL}?did=${did}&cli=${cli}`);
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

  ctx.kv.delete(did);

  const { data: profileRecord } = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: "app.bsky.actor.profile",
    rkey: "self",
  });
  const handle = await ctx.resolver.resolveDidToHandle(did);
  const profile: { handle?: string; displayName?: string; avatar?: BlobRef } =
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
      } else {
        await ctx.db
          .update(users)
          .set({
            handle,
            displayName: profile.displayName,
            avatar: `https://cdn.bsky.app/img/avatar/plain/${did}/${profile.avatar.ref.toString()}@jpeg`,
          })
          .where(eq(users.did, did))
          .execute();
      }
    }

    const [user, lastUser, previousLastUser] = await Promise.all([
      ctx.client.db.users.select(["*"]).filter("did", equals(did)).getFirst(),
      ctx.db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(1)
        .execute(),
      ctx.kv.get("lastUser"),
    ]);

    ctx.nc.publish("rocksky.user", Buffer.from(JSON.stringify(user)));

    await ctx.kv.set("lastUser", lastUser[0].id);
    // if (lastUser[0].id !== previousLastUser) {
    //  ctx.nc.publish("rocksky.user", Buffer.from(JSON.stringify(user)));
    // }
  }

  const [spotifyUser, spotifyToken, googledrive, dropbox] = await Promise.all([
    ctx.client.db.spotify_accounts
      .select(["user_id.*", "email", "is_beta_user"])
      .filter("user_id.did", equals(did))
      .getFirst(),
    ctx.client.db.spotify_tokens.filter("user_id.did", equals(did)).getFirst(),
    ctx.client.db.google_drive_accounts
      .select(["user_id.*", "email", "is_beta_user"])
      .filter("user_id.did", equals(did))
      .getFirst(),
    ctx.client.db.dropbox_accounts
      .select(["user_id.*", "email", "is_beta_user"])
      .filter("user_id.did", equals(did))
      .getFirst(),
  ]);

  return c.json({
    ...profile,
    spotifyUser,
    spotifyConnected: !!spotifyToken,
    googledrive,
    dropbox,
    did,
  });
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

  return c.json({ token });
});

export default app;
