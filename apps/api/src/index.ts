import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { trace } from "@opentelemetry/api";
import { ctx } from "context";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
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
import { rateLimiter } from "ratelimiter";
import subscribe from "subscribers";
import { saveTrack } from "tracks/tracks.service";
import { trackSchema } from "types/track";
import handleWebsocket from "websocket/handler";
import apikeys from "./apikeys/app";
import bsky from "./bsky/app";
import dropbox from "./dropbox/app";
import googledrive from "./googledrive/app";
import lastfm from "./lastfm/app";
import { env } from "./lib/env";
import { requestCounter, requestDuration } from "./metrics";
import "./profiling";
import albumTracks from "./schema/album-tracks";
import albums from "./schema/albums";
import artistTracks from "./schema/artist-tracks";
import artists from "./schema/artists";
import scrobbles from "./schema/scrobbles";
import tracks from "./schema/tracks";
import users from "./schema/users";
import spotify from "./spotify/app";
import tidal from "./tidal/app";
import "./tracing";
import usersApp from "./users/app";
import webscrobbler from "./webscrobbler/app";

subscribe(ctx);

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use(
  "*",
  rateLimiter({
    limit: 1000,
    window: 30, // 👈 30 seconds
  }),
);

app.use("*", async (c, next) => {
  const span = trace.getActiveSpan();
  span?.setAttribute("http.route", c.req.path);
  await next();
});

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = (Date.now() - start) / 1000;
  requestDuration.record(duration, {
    route: c.req.path,
    method: c.req.method,
  });
});

app.use(cors());

app.route("/", bsky);

app.route("/spotify", spotify);

app.route("/tidal", tidal);

app.route("/lastfm", lastfm);

app.route("/dropbox", dropbox);

app.route("/googledrive", googledrive);

app.route("/apikeys", apikeys);

app.get("/ws", upgradeWebSocket(handleWebsocket));

app.get("/", async (c) => {
  return c.json({ status: "ok" });
});

app.post("/now-playing", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/now-playing" });
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
  const parsed = trackSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid track data: " + parsed.error.message);
  }
  const track = parsed.data;

  const agent = await createAgent(ctx.oauthClient, did);
  if (!agent) {
    c.status(401);
    return c.text("Unauthorized");
  }

  await scrobbleTrack(ctx, track, agent, user.did);

  return c.json({ status: "ok" });
});

app.get("/now-playing", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/now-playing" });

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

  const [nowPlaying, status] = await Promise.all([
    ctx.redis.get(`nowplaying:${user.did}`),
    ctx.redis.get(`nowplaying:${user.did}:status`),
  ]);
  return c.json(
    nowPlaying ? { ...JSON.parse(nowPlaying), is_playing: status === "1" } : {},
  );
});

app.get("/now-playings", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/now-playings" });
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;
  const { data } = await ctx.analytics.post("library.getDistinctScrobbles", {
    pagination: {
      skip: offset,
      take: size,
    },
  });
  return c.json(data);
});

app.post("/likes", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/likes" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, did);

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
  const parsed = trackSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid track data: " + parsed.error.message);
  }
  const track = parsed.data;
  await likeTrack(ctx, track, user, agent);

  return c.json({ status: "ok" });
});

app.delete("/likes/:sha256", async (c) => {
  requestCounter.add(1, { method: "DELETE", route: "/likes/:sha256" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, did);

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

  const sha256 = c.req.param("sha256");
  await unLikeTrack(ctx, sha256, user, agent);
  return c.json({ status: "ok" });
});

app.get("/likes", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/likes" });
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

  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const lovedTracks = await getLovedTracks(ctx, user, size, offset);
  return c.json(lovedTracks);
});

app.get("/public/scrobbles", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/public/scrobbles" });

  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const scrobbleRecords = await ctx.db
    .select({
      scrobble: scrobbles,
      track: tracks,
      user: users,
    })
    .from(scrobbles)
    .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
    .innerJoin(users, eq(scrobbles.userId, users.id))
    .orderBy(desc(scrobbles.timestamp))
    .limit(size)
    .offset(offset);

  return c.json(
    scrobbleRecords.map((item) => ({
      cover: item.track.albumArt,
      artist: item.track.artist,
      title: item.track.title,
      date: item.scrobble.timestamp,
      user: item.user.handle,
      uri: item.scrobble.uri,
      albumUri: item.track.albumUri,
      artistUri: item.track.artistUri,
      tags: [],
      listeners: 1,
      sha256: item.track.sha256,
      id: item.scrobble.id,
    })),
  );
});

app.get("/public/scrobbleschart", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/public/scrobbleschart" });

  const did = c.req.query("did");
  const artisturi = c.req.query("artisturi");
  const albumuri = c.req.query("albumuri");
  const songuri = c.req.query("songuri");

  if (did) {
    const chart = await ctx.analytics.post("library.getScrobblesPerDay", {
      user_did: did,
    });
    return c.json(chart.data);
  }

  if (artisturi) {
    const chart = await ctx.analytics.post("library.getArtistScrobbles", {
      artist_id: artisturi,
    });
    return c.json(chart.data);
  }

  if (albumuri) {
    const chart = await ctx.analytics.post("library.getAlbumScrobbles", {
      album_id: albumuri,
    });
    return c.json(chart.data);
  }

  if (songuri) {
    let uri = songuri;
    if (songuri.includes("app.rocksky.scrobble")) {
      const scrobble = await ctx.db
        .select({
          scrobble: scrobbles,
          track: tracks,
        })
        .from(scrobbles)
        .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
        .where(eq(scrobbles.uri, songuri))
        .limit(1)
        .then((rows) => rows[0]);

      uri = scrobble.track.uri;
    }
    const chart = await ctx.analytics.post("library.getTrackScrobbles", {
      track_id: uri,
    });
    return c.json(chart.data);
  }

  const chart = await ctx.analytics.post("library.getScrobblesPerDay", {});
  return c.json(chart.data);
});

app.get("/scrobbles", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/scrobbles" });

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

  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const userScrobbles = await ctx.db
    .select({
      scrobble: scrobbles,
      track: tracks,
    })
    .from(scrobbles)
    .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
    .where(and(eq(scrobbles.userId, user.id), isNotNull(scrobbles.uri)))
    .orderBy(desc(scrobbles.createdAt))
    .limit(size)
    .offset(offset);

  return c.json(userScrobbles);
});

app.post("/tracks", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/tracks" });

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
  const parsed = trackSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid track data: " + parsed.error.message);
  }

  const track = parsed.data;

  const agent = await createAgent(ctx.oauthClient, did);
  if (!agent) {
    c.status(401);
    return c.text("Unauthorized");
  }

  try {
    await saveTrack(ctx, track, agent);
  } catch (e) {
    if (!e.message.includes("duplicate key value violates unique constraint")) {
      console.error("[tracks]", e.message);
    }
  }

  return c.json({ status: "ok" });
});

app.get("/tracks", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/tracks" });

  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const tracksData = await ctx.analytics.post("library.getTracks", {
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(tracksData.data);
});

app.get("/albums", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/albums" });

  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const albumsData = await ctx.analytics.post("library.getAlbums", {
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(albumsData.data);
});

app.get("/artists", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/artists" });

  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const artistsData = await ctx.analytics.post("library.getArtists", {
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(artistsData.data);
});

app.get("/tracks/:sha256", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/tracks/:sha256" });

  const sha256 = c.req.param("sha256");
  const track = await ctx.db
    .select()
    .from(tracks)
    .where(eq(tracks.sha256, sha256))
    .limit(1)
    .then((rows) => rows[0]);

  return c.json(track);
});

app.get("/albums/:sha256", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/albums/:sha256" });

  const sha256 = c.req.param("sha256");
  const album = await ctx.db
    .select()
    .from(albums)
    .where(eq(albums.sha256, sha256))
    .limit(1)
    .then((rows) => rows[0]);

  return c.json(album);
});

app.get("/artists/:sha256", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/artists/:sha256" });

  const sha256 = c.req.param("sha256");
  const artist = await ctx.db
    .select()
    .from(artists)
    .where(eq(artists.sha256, sha256))
    .limit(1)
    .then((rows) => rows[0]);

  return c.json(artist);
});

app.get("/artists/:sha256/tracks", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/artists/:sha256/tracks" });
  const sha256 = c.req.param("sha256");

  const artistTracksData = await ctx.db
    .select({
      track: tracks,
    })
    .from(artistTracks)
    .innerJoin(tracks, eq(artistTracks.trackId, tracks.id))
    .innerJoin(artists, eq(artistTracks.artistId, artists.id))
    .where(eq(artists.sha256, sha256));

  return c.json(artistTracksData.map((item) => item.track));
});

app.get("/albums/:sha256/tracks", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/albums/:sha256/tracks" });
  const sha256 = c.req.param("sha256");

  const albumTracksData = await ctx.db
    .select({
      track: tracks,
    })
    .from(albumTracks)
    .innerJoin(tracks, eq(albumTracks.trackId, tracks.id))
    .innerJoin(albums, eq(albumTracks.albumId, albums.id))
    .where(eq(albums.sha256, sha256));

  return c.json(albumTracksData.map((item) => item.track));
});

app.route("/users", usersApp);

app.route("/webscrobbler", webscrobbler);

const server = serve({
  fetch: app.fetch,
  port: 8000,
});

injectWebSocket(server);
