import { ctx } from "context";
import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { createPkcePair, encrypt } from "lib/crypto";
import { env } from "lib/env";
import crypto from "node:crypto";
import tidalAccounts from "schema/tidal-accounts";
import tidalTokens from "schema/tidal-tokens";
import users from "schema/users";

const app = new Hono();

app.get("/login", async (c) => {
  const did = c.req.query("did");

  const user = await ctx.db
    .select()
    .from(users)
    .where(or(eq(users.did, did), eq(users.handle, did)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { codeChallenge, codeVerifier } = createPkcePair();
  const redirectUrl = new URL("https://login.tidal.com/authorize");
  redirectUrl.searchParams.set("response_type", "code");
  redirectUrl.searchParams.set("client_id", env.TIDAL_CLIENT_ID);
  redirectUrl.searchParams.set("redirect_uri", env.TIDAL_REDIRECT_URI);
  redirectUrl.searchParams.set(
    "scope",
    "user.read collection.read search.read playlists.write playlists.read collection.write search.write"
  );
  redirectUrl.searchParams.set("code_challenge_method", "S256");
  redirectUrl.searchParams.set("code_challenge", codeChallenge);

  const state = crypto.randomBytes(16).toString("hex");

  redirectUrl.searchParams.set("state", state);

  ctx.kv.set(`tidal_pkce_${state}`, codeVerifier);
  ctx.kv.set(`tidal_state_${state}`, user.did);

  return c.json({
    redirectUrl: redirectUrl.href,
  });
});

app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const errorDescription = c.req.query("error_description");

  if (error) {
    return c.json(
      {
        success: false,
        error,
        errorDescription,
      },
      400
    );
  }

  if (!code) {
    return c.json(
      {
        success: false,
        error: "invalid_request",
        errorDescription: "Missing code parameter",
      },
      400
    );
  }

  // Exchange code for tokens
  const response = await fetch("https://auth.tidal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.TIDAL_CLIENT_ID,
      code,
      redirect_uri: env.TIDAL_REDIRECT_URI,
      code_verifier: ctx.kv.get(`tidal_pkce_${state}`),
    }),
  });

  if (!response.ok) {
    return c.json(
      {
        success: false,
        error: "invalid_request",
        errorDescription: "Failed to exchange code for tokens",
      },
      400
    );
  }

  const did = ctx.kv.get(`tidal_state_${state}`);
  if (!did) {
    return c.json(
      {
        success: false,
        error: "invalid_state",
        errorDescription: "Invalid state parameter",
      },
      400
    );
  }

  ctx.kv.delete(`tidal_pkce_${state}`);
  ctx.kv.delete(`tidal_state_${state}`);

  const token = await response.json();
  const user = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return c.json(
      {
        success: false,
        error: "unauthorized",
        errorDescription: "User not found",
      },
      401
    );
  }

  await ctx.db.transaction(async (tx) => {
    await tx
      .delete(tidalTokens)
      .where(eq(tidalTokens.userId, user.id))
      .execute();
    await tx
      .delete(tidalAccounts)
      .where(eq(tidalAccounts.userId, user.id))
      .execute();

    await tx
      .insert(tidalTokens)
      .values({
        userId: user.id,
        accessToken: encrypt(token.access_token, env.SPOTIFY_ENCRYPTION_KEY),
        refreshToken: encrypt(token.refresh_token, env.SPOTIFY_ENCRYPTION_KEY),
      })
      .execute();

    await tx
      .insert(tidalAccounts)
      .values({
        userId: user.id,
        tidalUserId: token.user_id,
      })
      .execute();
  });

  return c.redirect(`${env.FRONTEND_URL}/settings`);
});

app.put("/disconnect", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  await ctx.db
    .delete(tidalTokens)
    .where(eq(tidalTokens.userId, user.id))
    .execute();

  return c.json({
    success: true,
  });
});

export default app;
