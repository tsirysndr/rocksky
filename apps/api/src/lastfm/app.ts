import { ctx } from "context";
import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { encrypt } from "lib/crypto";
import { env } from "lib/env";
import crypto from "node:crypto";
import lastfmTokens from "schema/lastfm-tokens";
import users from "schema/users";

const app = new Hono();

app.get("/login", async (c) => {
  const did = c.req.query("did");

  if (!did) {
    c.status(400);
    return c.text("Missing did");
  }

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

  const publicUrl = env.PUBLIC_URL || `http://localhost:${env.PORT}`;
  const redirectUrl = new URL("https://www.last.fm/api/auth/");
  redirectUrl.searchParams.set("api_key", env.LASTFM_API_KEY);
  redirectUrl.searchParams.set("cb", `${publicUrl}/lastfm/callback`);
  const state = crypto.randomBytes(16).toString("hex");

  ctx.kv.set(`lastfm_state_${state}`, user.did);

  c.res.headers.set(
    "Set-Cookie",
    `lastfm_state=${state}; HttpOnly; Path=/; SameSite=Lax`
  );

  return c.redirect(redirectUrl.href);
});

app.get("/callback", async (c) => {
  const cookies = c.req.header("Cookie");
  if (!cookies) {
    return c.json({
      success: false,
      error: "Missing cookies",
    });
  }

  const state = cookies
    .split("; ")
    .find((cookie) => cookie.startsWith("lastfm_state="))
    ?.split("=")[1]
    ?.trim();
  if (!state) {
    return c.json({
      success: false,
      error: "Missing lastfm_state cookie",
    });
  }

  const did = ctx.kv.get(`lastfm_state_${state}`);
  if (!did) {
    return c.json({
      success: false,
      error: "Invalid state",
    });
  }

  const token = c.req.query("token");

  ctx.kv.delete(`lastfm_state_${state}`);

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
      .delete(lastfmTokens)
      .where(eq(lastfmTokens.userId, user.id))
      .execute();

    await tx
      .insert(lastfmTokens)
      .values({
        userId: user.id,
        token: encrypt(token, env.SPOTIFY_ENCRYPTION_KEY),
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
    .delete(lastfmTokens)
    .where(eq(lastfmTokens.userId, user.id))
    .execute();

  return c.json({
    success: true,
  });
});

export default app;
