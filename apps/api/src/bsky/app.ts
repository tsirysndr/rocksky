import { AtpAgent } from "@atproto/api";
import { isValidHandle } from "@atproto/syntax";
import { SCOPES } from "auth/client";
import { consola } from "consola";
import { ctx } from "context";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { deepSnakeCaseKeys } from "lib";
import { createAgent } from "lib/agent";
import { fetchBskyProfile } from "lib/bskyProfile";
import { env } from "lib/env";
import extractPdsFromDid from "lib/extractPdsFromDid";
import { verifyToken } from "lib/verifyToken";
import { requestCounter } from "metrics";
import dropboxAccounts from "schema/dropbox-accounts";
import googleDriveAccounts from "schema/google-drive-accounts";
import spotifyAccounts from "schema/spotify-accounts";
import spotifyTokens from "schema/spotify-tokens";
import users from "schema/users";

const app = new Hono();

app.get("/login", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/login" });
  const { handle, cli, prompt } = c.req.query();
  if ((typeof handle !== "string" || !isValidHandle(handle)) && !prompt) {
    c.status(400);
    return c.text("Invalid handle");
  }
  try {
    const url = await ctx.oauthClient.authorize(
      prompt ? "tsiry.selfhosted.social" : handle,
      {
        scope: SCOPES.join(" "),
        // @ts-expect-error: allow custom prompt param
        prompt,
      },
    );
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
      scope: SCOPES.join(" "),
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

  const { did } = await verifyToken(bearer);

  const agent = await createAgent(ctx.oauthClient, did);

  if (!agent) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const handle = await ctx.resolver.resolveDidToHandle(did);
  const resolved = await fetchBskyProfile(did, agent);

  if (handle) {
    try {
      await ctx.db
        .insert(users)
        .values({
          did,
          handle,
          displayName: resolved.displayName ?? null,
          avatar: resolved.avatar ?? "",
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
            // Only overwrite avatar/displayName when the lookup actually
            // returned them, so a failed/partial fetch never clobbers good data.
            ...(resolved.displayName !== undefined
              ? { displayName: resolved.displayName }
              : {}),
            ...(resolved.avatar !== undefined
              ? { avatar: resolved.avatar }
              : {}),
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

    ctx.kv.set("lastUser", lastUser[0].id);
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
    handle,
    displayName: resolved.displayName,
    avatar: resolved.avatar,
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

app.get("/oauth-client-metadata.json", (c) =>
  c.json(ctx.oauthClient.clientMetadata),
);

app.get("/jwks.json", (c) =>
  c.json({
    keys: [
      {
        kty: "EC",
        use: "sig",
        alg: "ES256",
        kid: "2dfa3fd9-57b3-4738-ac27-9e6dadec13b7",
        crv: "P-256",
        x: "V_00KDnoEPsNqbt0y2Ke8v27Mv9WP70JylDUD5rvIek",
        y: "HAyjaQeA2DU6wjZO0ggTadUS6ij1rmiYTxzmWeBKfRc",
      },
      {
        kty: "EC",
        use: "sig",
        alg: "ES256",
        kid: "5e816ff2-6bff-4177-b1c0-67ad3cd3e7cd",
        crv: "P-256",
        x: "YwEY5NsoYQVB_G7xPYMl9sUtxRbcPFNffnZcTS5nbPQ",
        y: "5n5mybPvISyYAnRv1Ii1geqKfXv2GA8p9Xemwx2a8CM",
      },
      {
        kty: "EC",
        use: "sig",
        kid: "a1067a48-a54a-43a0-9758-4d55b51fdd8b",
        crv: "P-256",
        x: "yq17Nd2DGcjP1i9I0NN3RBmgSbLQUZOtG6ec5GaqzmU",
        y: "ieIU9mcfaZwAW5b3WgJkIRgddymG_ckcZ0n1XjbEIvc",
      },
    ],
  }),
);

export default app;
