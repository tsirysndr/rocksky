import { consola } from "consola";
import { ctx } from "context";
import { and, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { decrypt, encrypt } from "lib/crypto";
import { env } from "lib/env";
import _ from "lodash";
import { requestCounter } from "metrics";
import crypto, { createHash } from "node:crypto";
import { rateLimiter } from "ratelimiter";
import lovedTracks from "schema/loved-tracks";
import spotifyAccounts from "schema/spotify-accounts";
import spotifyApps from "schema/spotify-apps";
import spotifyTokens from "schema/spotify-tokens";
import tracks from "schema/tracks";
import users from "schema/users";
import { emailSchema } from "types/email";

const app = new Hono();

app.use(
  "/currently-playing",
  rateLimiter({
    limit: 10, // max Spotify API calls
    window: 15, // per 10 seconds
    keyPrefix: "spotify-ratelimit",
  }),
);

app.get("/login", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/spotify/login" });
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

  const spotifyAccount = await ctx.db
    .select()
    .from(spotifyAccounts)
    .leftJoin(users, eq(spotifyAccounts.userId, users.id))
    .leftJoin(
      spotifyApps,
      eq(spotifyAccounts.spotifyAppId, spotifyApps.spotifyAppId),
    )
    .where(
      and(
        eq(spotifyAccounts.userId, user.id),
        eq(spotifyAccounts.isBetaUser, true),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  const state = crypto.randomBytes(16).toString("hex");
  ctx.kv.set(state, did);
  const redirectUrl = `https://accounts.spotify.com/en/authorize?client_id=${spotifyAccount?.spotify_apps?.spotifyAppId}&response_type=code&redirect_uri=${env.SPOTIFY_REDIRECT_URI}&scope=user-read-private%20user-read-email%20user-read-playback-state%20user-read-currently-playing%20user-modify-playback-state%20playlist-modify-public%20playlist-modify-private%20playlist-read-private%20playlist-read-collaborative&state=${state}`;
  c.header(
    "Set-Cookie",
    `session-id=${state}; Path=/; HttpOnly; SameSite=Strict; Secure`,
  );
  return c.json({ redirectUrl });
});

app.get("/callback", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/spotify/callback" });
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  const { code, state } = Object.fromEntries(params.entries());

  if (!state) {
    return c.redirect(env.FRONTEND_URL);
  }

  const did = ctx.kv.get(state);
  if (!did) {
    return c.redirect(env.FRONTEND_URL);
  }

  ctx.kv.delete(state);
  const user = await ctx.db
    .select()
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return c.redirect(env.FRONTEND_URL);
  }

  const spotifyAccount = await ctx.db
    .select()
    .from(spotifyAccounts)
    .leftJoin(
      spotifyApps,
      eq(spotifyAccounts.spotifyAppId, spotifyApps.spotifyAppId),
    )
    .where(
      and(
        eq(spotifyAccounts.userId, user.id),
        eq(spotifyAccounts.isBetaUser, true),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  const spotifyAppId = spotifyAccount.spotify_accounts.spotifyAppId
    ? spotifyAccount.spotify_accounts.spotifyAppId
    : env.SPOTIFY_CLIENT_ID;
  const spotifySecret = spotifyAccount.spotify_apps.spotifySecret
    ? spotifyAccount.spotify_apps.spotifySecret
    : env.SPOTIFY_CLIENT_SECRET;

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
      client_id: spotifyAppId,
      client_secret: decrypt(spotifySecret, env.SPOTIFY_ENCRYPTION_KEY),
    }),
  });
  const {
    access_token,
    refresh_token,
  }: {
    access_token: string;
    refresh_token: string;
  } = await response.json();

  const existingSpotifyToken = await ctx.db
    .select()
    .from(spotifyTokens)
    .where(eq(spotifyTokens.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (existingSpotifyToken) {
    await ctx.db
      .update(spotifyTokens)
      .set({
        accessToken: encrypt(access_token, env.SPOTIFY_ENCRYPTION_KEY),
        refreshToken: encrypt(refresh_token, env.SPOTIFY_ENCRYPTION_KEY),
      })
      .where(eq(spotifyTokens.id, existingSpotifyToken.id));
  } else {
    await ctx.db.insert(spotifyTokens).values({
      userId: user.id,
      accessToken: encrypt(access_token, env.SPOTIFY_ENCRYPTION_KEY),
      refreshToken: encrypt(refresh_token, env.SPOTIFY_ENCRYPTION_KEY),
      spotifyAppId,
    });
  }

  const spotifyUser = await ctx.db
    .select()
    .from(spotifyAccounts)
    .where(
      and(
        eq(spotifyAccounts.userId, user.id),
        eq(spotifyAccounts.isBetaUser, true),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (spotifyUser?.email) {
    ctx.nc.publish("rocksky.spotify.user", Buffer.from(spotifyUser.email));
  }

  return c.redirect(env.FRONTEND_URL);
});

app.post("/join", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/spotify/join" });
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

  const body = await c.req.json();
  const parsed = emailSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text(`Invalid email: ${parsed.error.message}`);
  }

  const apps = await ctx.db
    .select({
      appId: spotifyApps.id,
      spotifyAppId: spotifyApps.spotifyAppId,
      accountCount: sql<number>`COUNT(${spotifyAccounts.id})`.as(
        "account_count",
      ),
    })
    .from(spotifyApps)
    .leftJoin(
      spotifyAccounts,
      eq(spotifyApps.spotifyAppId, spotifyAccounts.spotifyAppId),
    )
    .groupBy(spotifyApps.id, spotifyApps.spotifyAppId)
    .having(sql`COUNT(${spotifyAccounts.id}) < 25`);

  const { email } = parsed.data;

  try {
    await ctx.db.insert(spotifyAccounts).values({
      userId: user.id,
      email,
      isBetaUser: false,
      spotifyAppId: _.get(apps, "[0].spotifyAppId"),
    });
  } catch (e) {
    if (!e.message.includes("duplicate key value violates unique constraint")) {
      consola.error(e.message);
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
  requestCounter.add(1, { method: "GET", route: "/spotify/currently-playing" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  const payload =
    bearer && bearer !== "null"
      ? jwt.verify(bearer, env.JWT_SECRET, { ignoreExpiration: true })
      : {};
  const did = c.req.query("did") || payload.did;

  if (!did) {
    c.status(401);
    return c.text("Unauthorized");
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

  const spotifyAccount = await ctx.db
    .select({
      spotifyAccount: spotifyAccounts,
      user: users,
    })
    .from(spotifyAccounts)
    .innerJoin(users, eq(spotifyAccounts.userId, users.id))
    .where(or(eq(users.did, did), eq(users.handle, did)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!spotifyAccount) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const cached = await ctx.redis.get(
    `${spotifyAccount.spotifyAccount.email}:current`,
  );
  if (!cached) {
    return c.json({});
  }

  const track = JSON.parse(cached);

  const sha256 = createHash("sha256")
    .update(
      `${track.item.name} - ${track.item.artists.map((x) => x.name).join(", ")} - ${track.item.album.name}`.toLowerCase(),
    )
    .digest("hex");

  const [result, liked] = await Promise.all([
    ctx.db
      .select()
      .from(tracks)
      .where(eq(tracks.sha256, sha256))
      .limit(1)
      .then((rows) => rows[0]),
    ctx.db
      .select({
        lovedTrack: lovedTracks,
        track: tracks,
      })
      .from(lovedTracks)
      .innerJoin(tracks, eq(lovedTracks.trackId, tracks.id))
      .where(and(eq(lovedTracks.userId, user.id), eq(tracks.sha256, sha256)))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  return c.json({
    ...track,
    songUri: result?.uri,
    artistUri: result?.artistUri,
    albumUri: result?.albumUri,
    liked: !!liked,
    sha256,
  });
});

app.put("/pause", async (c) => {
  requestCounter.add(1, { method: "PUT", route: "/spotify/pause" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  const { did } =
    bearer && bearer !== "null"
      ? jwt.verify(bearer, env.JWT_SECRET, { ignoreExpiration: true })
      : {};

  if (!did) {
    c.status(401);
    return c.text("Unauthorized");
  }

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

  const spotifyToken = await ctx.db
    .select()
    .from(spotifyTokens)
    .leftJoin(
      spotifyApps,
      eq(spotifyTokens.spotifyAppId, spotifyApps.spotifyAppId),
    )
    .where(eq(spotifyTokens.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!spotifyToken) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const refreshToken = decrypt(
    spotifyToken.spotify_tokens.refreshToken,
    env.SPOTIFY_ENCRYPTION_KEY,
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
      client_id: spotifyToken.spotify_apps.spotifyAppId,
      client_secret: decrypt(
        spotifyToken.spotify_apps.spotifySecret,
        env.SPOTIFY_ENCRYPTION_KEY,
      ),
    }),
  });

  const { access_token } = (await newAccessToken.json()) as {
    access_token: string;
  };

  const response = await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  if (response.status === 403) {
    c.status(403);
    return c.text(await response.text());
  }

  return c.json(await response.json());
});

app.put("/play", async (c) => {
  requestCounter.add(1, { method: "PUT", route: "/spotify/play" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  const { did } =
    bearer && bearer !== "null"
      ? jwt.verify(bearer, env.JWT_SECRET, { ignoreExpiration: true })
      : {};

  if (!did) {
    c.status(401);
    return c.text("Unauthorized");
  }

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

  const spotifyToken = await ctx.db
    .select()
    .from(spotifyTokens)
    .leftJoin(
      spotifyApps,
      eq(spotifyTokens.spotifyAppId, spotifyApps.spotifyAppId),
    )
    .where(eq(spotifyTokens.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!spotifyToken) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const refreshToken = decrypt(
    spotifyToken.spotify_tokens.refreshToken,
    env.SPOTIFY_ENCRYPTION_KEY,
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
      client_id: spotifyToken.spotify_apps.spotifyAppId,
      client_secret: decrypt(
        spotifyToken.spotify_apps.spotifySecret,
        env.SPOTIFY_ENCRYPTION_KEY,
      ),
    }),
  });

  const { access_token } = (await newAccessToken.json()) as {
    access_token: string;
  };

  const response = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  if (response.status === 403) {
    c.status(403);
    return c.text(await response.text());
  }

  return c.json(await response.json());
});

app.post("/next", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/spotify/next" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  const { did } =
    bearer && bearer !== "null"
      ? jwt.verify(bearer, env.JWT_SECRET, { ignoreExpiration: true })
      : {};

  if (!did) {
    c.status(401);
    return c.text("Unauthorized");
  }

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

  const spotifyToken = await ctx.db
    .select()
    .from(spotifyTokens)
    .leftJoin(
      spotifyApps,
      eq(spotifyTokens.spotifyAppId, spotifyApps.spotifyAppId),
    )
    .where(eq(spotifyTokens.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!spotifyToken) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const refreshToken = decrypt(
    spotifyToken.spotify_tokens.refreshToken,
    env.SPOTIFY_ENCRYPTION_KEY,
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
      client_id: spotifyToken.spotify_apps.spotifyAppId,
      client_secret: decrypt(
        spotifyToken.spotify_apps.spotifySecret,
        env.SPOTIFY_ENCRYPTION_KEY,
      ),
    }),
  });

  const { access_token } = (await newAccessToken.json()) as {
    access_token: string;
  };

  const response = await fetch("https://api.spotify.com/v1/me/player/next", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  if (response.status === 403) {
    c.status(403);
    return c.text(await response.text());
  }

  return c.json(await response.json());
});

app.post("/previous", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/spotify/previous" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  const { did } =
    bearer && bearer !== "null"
      ? jwt.verify(bearer, env.JWT_SECRET, { ignoreExpiration: true })
      : {};

  if (!did) {
    c.status(401);
    return c.text("Unauthorized");
  }

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

  const spotifyToken = await ctx.db
    .select()
    .from(spotifyTokens)
    .leftJoin(
      spotifyApps,
      eq(spotifyTokens.spotifyAppId, spotifyApps.spotifyAppId),
    )
    .where(eq(spotifyTokens.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!spotifyToken) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const refreshToken = decrypt(
    spotifyToken.spotify_tokens.refreshToken,
    env.SPOTIFY_ENCRYPTION_KEY,
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
      client_id: spotifyToken.spotify_apps.spotifyAppId,
      client_secret: decrypt(
        spotifyToken.spotify_apps.spotifySecret,
        env.SPOTIFY_ENCRYPTION_KEY,
      ),
    }),
  });

  const { access_token } = (await newAccessToken.json()) as {
    access_token: string;
  };

  const response = await fetch(
    "https://api.spotify.com/v1/me/player/previous",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    },
  );

  if (response.status === 403) {
    c.status(403);
    return c.text(await response.text());
  }

  return c.json(await response.json());
});

app.put("/seek", async (c) => {
  requestCounter.add(1, { method: "PUT", route: "/spotify/seek" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  const { did } =
    bearer && bearer !== "null"
      ? jwt.verify(bearer, env.JWT_SECRET, { ignoreExpiration: true })
      : {};

  if (!did) {
    c.status(401);
    return c.text("Unauthorized");
  }

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

  const spotifyToken = await ctx.db
    .select()
    .from(spotifyTokens)
    .leftJoin(
      spotifyApps,
      eq(spotifyTokens.spotifyAppId, spotifyApps.spotifyAppId),
    )
    .where(eq(spotifyTokens.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!spotifyToken) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const refreshToken = decrypt(
    spotifyToken.spotify_tokens.refreshToken,
    env.SPOTIFY_ENCRYPTION_KEY,
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
      client_id: spotifyToken.spotify_apps.spotifyAppId,
      client_secret: decrypt(
        spotifyToken.spotify_apps.spotifySecret,
        env.SPOTIFY_ENCRYPTION_KEY,
      ),
    }),
  });

  const { access_token } = (await newAccessToken.json()) as {
    access_token: string;
  };

  const position = c.req.query("position_ms");
  const response = await fetch(
    `https://api.spotify.com/v1/me/player/seek?position_ms=${position}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    },
  );

  if (response.status === 403) {
    c.status(403);
    return c.text(await response.text());
  }

  return c.json(await response.json());
});

export default app;
