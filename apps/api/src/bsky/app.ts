import { AtpAgent } from "@atproto/api";
import { consola } from "consola";
import type { BlobRef } from "@atproto/lexicon";
import { isValidHandle } from "@atproto/syntax";
import { ctx } from "context";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import * as Profile from "lexicon/types/app/bsky/actor/profile";
import { deepSnakeCaseKeys } from "lib";
import { createAgent } from "lib/agent";
import { env } from "lib/env";
import extractPdsFromDid from "lib/extractPdsFromDid";
import { requestCounter } from "metrics";
import dropboxAccounts from "schema/dropbox-accounts";
import googleDriveAccounts from "schema/google-drive-accounts";
import spotifyAccounts from "schema/spotify-accounts";
import spotifyTokens from "schema/spotify-tokens";
import users from "schema/users";

const app = new Hono();

app.get("/login", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/login" });
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
  requestCounter.add(1, { method: "POST", route: "/login" });
  const { handle, cli, password } = await c.req.json();
  if (typeof handle !== "string" || !isValidHandle(handle)) {
    c.status(400);
    return c.text("Invalid handle");
  }

  try {
    if (password) {
      const defaultAgent = new AtpAgent({
        service: new URL("https://bsky.social"),
      });
      const {
        data: { did },
      } = await defaultAgent.resolveHandle({ handle });

      let pds = await ctx.redis.get(`pds:${did}`);
      if (!pds) {
        pds = await extractPdsFromDid(did);
        await ctx.redis.setEx(`pds:${did}`, 60 * 15, pds);
      }

      const agent = new AtpAgent({
        service: new URL(pds),
      });

      await agent.login({
        identifier: handle,
        password,
      });

      await ctx.sqliteDb
        .insertInto("auth_session")
        .values({
          key: `atp:${did}`,
          session: JSON.stringify(agent.session),
        })
        .onConflict((oc) =>
          oc
            .column("key")
            .doUpdateSet({ session: JSON.stringify(agent.session) }),
        )
        .execute();

      const token = jwt.sign(
        {
          did,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        },
        env.JWT_SECRET,
      );

      return c.text(`jwt:${token}`);
    }

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
  requestCounter.add(1, { method: "GET", route: "/oauth/callback" });
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  let did: string, cli: string;

  try {
    const { session } = await ctx.oauthClient.callback(params);
    did = session.did;
    const handle = await ctx.resolver.resolveDidToHandle(did);
    cli = ctx.kv.get(`cli:${handle}`);
    ctx.kv.delete(`cli:${handle}`);

    const token = jwt.sign(
      {
        did,
        exp: cli
          ? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 1000
          : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      },
      env.JWT_SECRET,
    );
    ctx.kv.set(did, token);
  } catch (err) {
    consola.error({ err }, "oauth callback failed");
    return c.redirect(`${env.FRONTEND_URL}?error=1`);
  }

  const [spotifyUser] = await ctx.db
    .select()
    .from(spotifyAccounts)
    .where(
      and(
        eq(spotifyAccounts.userId, did),
        eq(spotifyAccounts.isBetaUser, true),
      ),
    )
    .limit(1)
    .execute();

  if (spotifyUser?.email) {
    ctx.nc.publish("rocksky.spotify.user", Buffer.from(spotifyUser.email));
  }

  if (!cli) {
    return c.redirect(`${env.FRONTEND_URL}?did=${did}`);
  }

  return c.redirect(`${env.FRONTEND_URL}?did=${did}&cli=${cli}`);
});

app.get("/profile", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/profile" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

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
  const profile: { handle?: string; displayName?: string; avatar?: BlobRef } =
    Profile.isRecord(profileRecord.value)
      ? { ...profileRecord.value, handle }
      : {};

  if (profile.handle) {
    try {
      await ctx.db
        .insert(users)
        .values({
          did,
          handle,
          displayName: profile.displayName,
          avatar: `https://cdn.bsky.app/img/avatar/plain/${did}/${profile.avatar.ref.toString()}@jpeg`,
        })
        .execute();
    } catch (e) {
      if (!e.message.includes("invalid record: column [did]: is not unique")) {
        consola.error(e.message);
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

    const [user, lastUser] = await Promise.all([
      ctx.db.select().from(users).where(eq(users.did, did)).limit(1).execute(),
      ctx.db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(1)
        .execute(),
    ]);

    ctx.nc.publish(
      "rocksky.user",
      Buffer.from(JSON.stringify(deepSnakeCaseKeys(user))),
    );

    await ctx.kv.set("lastUser", lastUser[0].id);
  }

  const [spotifyUser, spotifyToken, googledrive, dropbox] = await Promise.all([
    ctx.db
      .select()
      .from(spotifyAccounts)
      .where(
        and(
          eq(spotifyAccounts.userId, did),
          eq(spotifyAccounts.isBetaUser, true),
        ),
      )
      .limit(1)
      .execute(),
    ctx.db
      .select()
      .from(spotifyTokens)
      .where(eq(spotifyTokens.userId, did))
      .limit(1)
      .execute(),
    ctx.db
      .select()
      .from(googleDriveAccounts)
      .where(
        and(
          eq(googleDriveAccounts.userId, did),
          eq(googleDriveAccounts.isBetaUser, true),
        ),
      )
      .limit(1)
      .execute(),
    ctx.db
      .select()
      .from(dropboxAccounts)
      .where(
        and(
          eq(dropboxAccounts.userId, did),
          eq(dropboxAccounts.isBetaUser, true),
        ),
      )
      .limit(1)
      .execute(),
  ]).then(([s, t, g, d]) => deepSnakeCaseKeys([s[0], t[0], g[0], d[0]]));

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
  requestCounter.add(1, { method: "GET", route: "/client-metadata.json" });
  return c.json(ctx.oauthClient.clientMetadata);
});

app.get("/token", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/token" });
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

export default app;
