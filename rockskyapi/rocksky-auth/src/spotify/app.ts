import { equals } from "@xata.io/client";
import { ctx } from "context";
import crypto, { createHash } from "crypto";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { decrypt, encrypt } from "lib/crypto";
import { env } from "lib/env";
import { emailSchema } from "types/email";

const app = new Hono();

app.get("/login", async (c) => {
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

  const state = crypto.randomBytes(16).toString("hex");
  ctx.kv.set(state, did);
  const redirectUrl = `https://accounts.spotify.com/en/authorize?client_id=${env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${env.SPOTIFY_REDIRECT_URI}&scope=user-read-private%20user-read-email%20user-read-playback-state%20user-read-currently-playing%20user-modify-playback-state%20playlist-modify-public%20playlist-modify-private%20playlist-read-private%20playlist-read-collaborative&state=${state}`;
  c.header(
    "Set-Cookie",
    `session-id=${state}; Path=/; HttpOnly; SameSite=Strict; Secure`
  );
  return c.json({ redirectUrl });
});

app.get("/callback", async (c) => {
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  const { code, state } = Object.fromEntries(params.entries());

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
      client_id: env.SPOTIFY_CLIENT_ID,
      client_secret: env.SPOTIFY_CLIENT_SECRET,
    }),
  });
  const { access_token, refresh_token } = await response.json();

  if (!state) {
    return c.redirect(env.FRONTEND_URL);
  }

  const did = ctx.kv.get(state);
  if (!did) {
    return c.redirect(env.FRONTEND_URL);
  }

  ctx.kv.delete(state);
  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();

  if (!user) {
    return c.redirect(env.FRONTEND_URL);
  }

  const spotifyToken = await ctx.client.db.spotify_tokens
    .filter("user_id", equals(user.xata_id))
    .getFirst();

  await ctx.client.db.spotify_tokens.createOrUpdate(spotifyToken?.xata_id, {
    user_id: user.xata_id,
    access_token: encrypt(access_token, env.SPOTIFY_ENCRYPTION_KEY),
    refresh_token: encrypt(refresh_token, env.SPOTIFY_ENCRYPTION_KEY),
  });

  return c.redirect(env.FRONTEND_URL);
});

app.post("/join", async (c) => {
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
  const parsed = emailSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid email: " + parsed.error.message);
  }

  const { email } = parsed.data;

  try {
    await ctx.client.db.spotify_accounts.create({
      user_id: user.xata_id,
      email,
      is_beta_user: false,
    });
  } catch (e) {
    if (
      !e.message.includes("invalid record: column [user_id]: is not unique")
    ) {
      console.error(e.message);
    } else {
      throw e;
    }
  }

  await fetch("https://beta.rocksky.app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ROCKSKY_BETA_TOKEN}`,
    },
    body: JSON.stringify({ email }),
  });

  return c.json({ status: "ok" });
});

app.get("/currently-playing", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  const payload =
    bearer && bearer !== "null" ? jwt.verify(bearer, env.JWT_SECRET) : {};
  const did = c.req.query("did") || payload.did;

  if (!did) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const user = await ctx.client.db.users
    .filter({
      $any: [{ "user_id.did": did }, { "user_id.handle": did }],
    })
    .getFirst();

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const spotifyAccount = await ctx.client.db.spotify_accounts
    .filter({
      $any: [{ "user_id.did": did }, { "user_id.handle": did }],
    })
    .getFirst();

  if (!spotifyAccount) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const spotifyToken = await ctx.client.db.spotify_tokens
    .filter({
      $any: [{ "user_id.did": did }, { "user_id.handle": did }],
    })
    .getFirst();

  if (!spotifyToken) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const refreshToken = decrypt(
    spotifyToken.refresh_token,
    env.SPOTIFY_ENCRYPTION_KEY
  );

  // get new access token
  const newAccessToken = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.SPOTIFY_CLIENT_ID,
      client_secret: env.SPOTIFY_CLIENT_SECRET,
    }),
  });

  const { access_token } = await newAccessToken.json();

  const response = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    }
  );

  // No content means no track is playing
  if (response.status === 204) {
    return c.json({});
  }

  const track = await response.json();

  const sha256 = createHash("sha256")
    .update(
      `${track.item.name} - ${track.item.artists.map((x) => x.name).join(", ")} - ${track.item.album.name}`.toLowerCase()
    )
    .digest("hex");

  const result = await ctx.client.db.tracks
    .filter("sha256", equals(sha256))
    .getFirst();

  return c.json({
    ...track,
    songUri: result?.uri,
    artistUri: result?.artist_uri,
    albumUri: result?.album_uri,
  });
});

export default app;
