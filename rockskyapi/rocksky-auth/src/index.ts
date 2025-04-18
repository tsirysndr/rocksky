import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { trace } from "@opentelemetry/api";
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
import subscribe from "subscribers";
import { saveTrack } from "tracks/tracks.service";
import { trackSchema } from "types/track";
import handleWebsocket from "websocket/handler";
import apikeys from "./apikeys/app";
import bsky from "./bsky/app";
import dropbox from "./dropbox/app";
import googledrive from "./googledrive/app";
import { env } from "./lib/env";
import { requestCounter, requestDuration } from "./metrics";
import search from "./search/app";
import spotify from "./spotify/app";
import "./tracing";
import users from "./users/app";

subscribe(ctx);

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

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

  const agent = await createAgent(ctx.oauthClient, did);
  if (!agent) {
    c.status(401);
    return c.text("Unauthorized");
  }

  await scrobbleTrack(ctx, track, user, agent);

  return c.json({ status: "ok" });
});

app.get("/now-playing", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/now-playing" });

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
      $any: [{ did }, { handle: did }],
    })
    .getFirst();

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const [nowPlaying, status] = await Promise.all([
    ctx.redis.get(`nowplaying:${user.did}`),
    ctx.redis.get(`nowplaying:${user.did}:status`),
  ]);
  return c.json(
    nowPlaying ? { ...JSON.parse(nowPlaying), is_playing: status === "1" } : {}
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

  const { did } = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, did);

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

  const { did } = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, did);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
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

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
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

  const scrobbles = await ctx.client.db.scrobbles
    .select(["track_id.*", "user_id.*", "timestamp", "xata_createdat", "uri"])
    .sort("timestamp", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });

  return c.json(
    scrobbles.records.map((item) => ({
      cover: item.track_id.album_art,
      artist: item.track_id.artist,
      title: item.track_id.title,
      date: item.timestamp,
      user: item.user_id.handle,
      uri: item.uri,
      tags: [],
      listeners: 1,
      sha256: item.track_id.sha256,
      id: item.xata_id,
    }))
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
      const scrobble = await ctx.client.db.scrobbles
        .select(["track_id.*", "uri"])
        .filter("uri", equals(songuri))
        .getFirst();

      uri = scrobble.track_id.uri;
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

  const { did } = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const scrobbles = await ctx.client.db.scrobbles
    .select(["track_id.*", "uri"])
    .filter("user_id", equals(user.xata_id))
    .filter({
      $not: [
        {
          uri: null,
        },
      ],
    })
    .sort("xata_createdat", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });

  return c.json(scrobbles.records);
});

app.post("/tracks", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/tracks" });

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

  const agent = await createAgent(ctx.oauthClient, did);
  if (!agent) {
    c.status(401);
    return c.text("Unauthorized");
  }

  try {
    await saveTrack(ctx, track, agent);
  } catch (e) {
    if (!e.message.includes("invalid record: column [sha256]: is not unique")) {
      console.error("[spotify user]", e.message);
    }
  }

  return c.json({ status: "ok" });
});

app.get("/tracks", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/tracks" });

  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const tracks = await ctx.analytics.post("library.getTracks", {
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(tracks.data);
});

app.get("/albums", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/albums" });

  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const albums = await ctx.analytics.post("library.getAlbums", {
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(albums.data);
});

app.get("/artists", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/artists" });

  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const artists = await ctx.analytics.post("library.getArtists", {
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(artists.data);
});

app.get("/tracks/:sha256", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/tracks/:sha256" });

  const sha256 = c.req.param("sha256");
  const track = await ctx.client.db.tracks
    .filter("sha256", equals(sha256))
    .getFirst();
  return c.json(track);
});

app.get("/albums/:sha256", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/albums/:sha256" });

  const sha256 = c.req.param("sha256");
  const album = await ctx.client.db.albums
    .filter("sha256", equals(sha256))
    .getFirst();

  return c.json(album);
});

app.get("/artists/:sha256", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/artists/:sha256" });

  const sha256 = c.req.param("sha256");
  const artist = await ctx.client.db.artists
    .filter("sha256", equals(sha256))
    .getFirst();

  return c.json(artist);
});

app.get("/artists/:sha256/tracks", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/artists/:sha256/tracks" });
  const sha256 = c.req.param("sha256");

  const tracks = await ctx.client.db.artist_tracks
    .select(["track_id.*"])
    .filter("artist_id.sha256", equals(sha256))
    .getAll();

  return c.json(tracks);
});

app.get("/albums/:sha256/tracks", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/albums/:sha256/tracks" });
  const sha256 = c.req.param("sha256");
  const tracks = await ctx.client.db.album_tracks
    .select(["track_id.*"])
    .filter("album_id.sha256", equals(sha256))
    .getAll();

  return c.json(tracks);
});

app.route("/users", users);

app.route("/search", search);

const server = serve({
  fetch: app.fetch,
  port: 8000,
});

injectWebSocket(server);
