import { isValidHandle } from "@atproto/syntax";
import { serve } from "@hono/node-server";
import { equals } from "@xata.io/client";
import { ctx } from "context";
import crypto from "crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import jwt from "jsonwebtoken";
import { createAgent } from "lib/agent";
import { encrypt } from "lib/crypto";
import _ from "lodash";
import {
  getLovedTracks,
  likeTrack,
  unLikeTrack,
} from "lovedtracks/lovedtracks.service";
import { scrobbleTrack } from "nowplaying/nowplaying.service";
import { saveTrack } from "tracks/tracks.service";
import { emailSchema } from "types/email";
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

app.get("/spotify/login", async (c) => {
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
  const redirectUrl = `https://accounts.spotify.com/en/authorize?client_id=${env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${env.SPOTIFY_REDIRECT_URI}&scope=user-read-private%20user-read-email%20user-read-playback-state%20user-read-currently-playing&state=${state}`;
  c.header(
    "Set-Cookie",
    `session-id=${state}; Path=/; HttpOnly; SameSite=Strict; Secure`
  );
  return c.json({ redirectUrl });
});

app.get("/spotify/callback", async (c) => {
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

app.post("/spotify/join", async (c) => {
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
  return c.json({ status: "ok" });
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

  ctx.kv.delete(did);

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

  const spotifyUser = await ctx.client.db.spotify_accounts
    .select(["user_id.*", "email", "is_beta_user"])
    .filter("user_id.did", equals(did))
    .getFirst();

  const spotifyToken = await ctx.client.db.spotify_tokens
    .filter("user_id.did", equals(did))
    .getFirst();

  return c.json({ ...profile, spotifyUser, spotifyConnected: !!spotifyToken });
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

  const agent = await createAgent(ctx.oauthClient, did);
  if (!agent) {
    c.status(401);
    return c.text("Unauthorized");
  }

  await scrobbleTrack(ctx, track, user, agent);

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

  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const lovedTracks = await getLovedTracks(ctx, user, size, offset);
  return c.json(lovedTracks);
});

app.get("/public/scrobbles", async (c) => {
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const scrobbles = await ctx.client.db.scrobbles
    .select(["track_id.*", "user_id.*", "xata_createdat", "uri"])
    .sort("xata_createdat", "desc")
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
      date: item.xata_createdat,
      user: item.user_id.handle,
      uri: item.uri,
      tags: [],
      listeners: 1,
      sha256: item.track_id.sha256,
      id: item.xata_id,
    }))
  );
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

  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const scrobbles = await ctx.client.db.scrobbles
    .select(["track_id.*", "uri"])
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

app.post("/tracks", async (c) => {
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
  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const tracks = await ctx.client.db.tracks
    .sort("xata_createdat", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });

  return c.json(tracks.records);
});

app.get("/albums", async (c) => {
  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const albums = await ctx.client.db.albums
    .sort("xata_createdat", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });

  return c.json(albums.records);
});

app.get("/artists", async (c) => {
  const size = +c.req.query("size") || 100;
  const offset = +c.req.query("offset") || 0;

  const artists = await ctx.client.db.artists
    .sort("xata_createdat", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });

  return c.json(artists.records);
});

app.get("/tracks/:sha256", async (c) => {
  const sha256 = c.req.param("sha256");
  const track = await ctx.client.db.tracks
    .filter("sha256", equals(sha256))
    .getFirst();
  return c.json(track);
});

app.get("/albums/:sha256", async (c) => {
  const sha256 = c.req.param("sha256");
  const album = await ctx.client.db.albums
    .filter("sha256", equals(sha256))
    .getFirst();

  return c.json(album);
});

app.get("/artists/:sha256", async (c) => {
  const sha256 = c.req.param("sha256");
  const artist = await ctx.client.db.artists
    .filter("sha256", equals(sha256))
    .getFirst();

  return c.json(artist);
});

app.get("/artists/:sha256/tracks", async (c) => {
  const sha256 = c.req.param("sha256");

  const tracks = await ctx.client.db.artist_tracks
    .select(["track_id.*"])
    .filter("artist_id.sha256", equals(sha256))
    .getAll();

  return c.json(tracks);
});

app.get("/albums/:sha256/tracks", async (c) => {
  const sha256 = c.req.param("sha256");
  const tracks = await ctx.client.db.album_tracks
    .select(["track_id.*"])
    .filter("album_id.sha256", equals(sha256))
    .getAll();

  return c.json(tracks);
});

app.get("/users/:did/likes", async (c) => {
  const did = c.req.param("handle");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const lovedTracks = await ctx.client.db.loved_tracks
    .select(["track_id.*"])
    .filter({
      $any: [
        {
          "user_id.did": did,
        },
        {
          "user_id.handle": did,
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
  return c.json(lovedTracks);
});

app.get("/users/:handle/scrobbles", async (c) => {
  const handle = c.req.param("handle");

  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const scrobbles = await ctx.client.db.scrobbles
    .select(["track_id.*", "uri", "album_id.*", "artist_id.*"])
    .filter({
      $any: [
        {
          "user_id.did": handle,
        },
        {
          "user_id.handle": handle,
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

app.get("/users/:did/albums", async (c) => {
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const albums = await ctx.client.db.user_albums
    .select(["album_id.*", "scrobbles"])
    .filter({
      $any: [
        {
          "user_id.did": did,
        },
        {
          "user_id.handle": did,
        },
      ],
    })
    .getPaginated({
      sort: {
        scrobbles: "desc",
      },
      pagination: {
        size,
        offset,
      },
    });

  return c.json(albums.records.map((item) => ({ ...item.album_id, tags: [] })));
});

app.get("/users/:did/artists", async (c) => {
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const artists = await ctx.client.db.user_artists
    .select(["artist_id.*", "scrobbles"])
    .filter({
      $any: [
        {
          "user_id.did": did,
        },
        {
          "user_id.handle": did,
        },
      ],
    })
    .getPaginated({
      sort: {
        scrobbles: "desc",
      },
      pagination: {
        size,
        offset,
      },
    });

  return c.json(
    artists.records.map((item) => ({ ...item.artist_id, tags: [] }))
  );
});

app.get("/users/:did/tracks", async (c) => {
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const artists = await ctx.client.db.user_tracks
    .select(["track_id.*", "scrobbles"])
    .filter({
      $any: [
        {
          "user_id.did": did,
        },
        {
          "user_id.handle": did,
        },
      ],
    })
    .getPaginated({
      sort: {
        scrobbles: "desc",
      },
      pagination: {
        size,
        offset,
      },
    });

  return c.json(
    artists.records.map((item) => ({
      ...item.track_id,
      scrobles: item.scrobbles,
      tags: [],
    }))
  );
});

app.get("/users/:did/app.rocksky.scrobble/:rkey", async (c) => {
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.scrobble/${rkey}`;

  const scrobble = await ctx.client.db.scrobbles
    .select(["track_id.*", "user_id.*", "xata_createdat", "uri"])
    .filter("uri", equals(uri))
    .getFirst();

  if (!scrobble) {
    c.status(404);
    return c.text("Scrobble not found");
  }

  return c.json({ ...scrobble, listeners: 1, tags: [] });
});

app.get("/users/:did/app.rocksky.artist/:rkey", async (c) => {
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.artist/${rkey}`;

  const artist = await ctx.client.db.artists
    .filter("uri", equals(uri))
    .getFirst();

  if (!artist) {
    c.status(404);
    return c.text("Artist not found");
  }

  const { summaries } = await ctx.client.db.user_artists
    .select(["artist_id.*"])
    .filter({
      "artist_id.uri": equals(uri),
    })
    .summarize({
      summaries: {
        total: {
          count: "*",
        },
      },
    });

  return c.json({
    ...artist,
    listeners: _.get(summaries, "0.total", 1),
    tags: [],
  });
});

app.get("/users/:did/app.rocksky.album/:rkey", async (c) => {
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.album/${rkey}`;

  const album = await ctx.client.db.albums
    .filter("uri", equals(uri))
    .getFirst();

  if (!album) {
    c.status(404);
    return c.text("Album not found");
  }

  const tracks = await ctx.client.db.album_tracks
    .select(["track_id.*"])
    .filter("album_id.uri", equals(uri))
    .sort("track_id.track_number", "asc")
    .getAll();

  const { summaries } = await ctx.client.db.user_albums
    .select(["album_id.*"])
    .filter({
      "album_id.uri": equals(uri),
    })
    .summarize({
      summaries: {
        total: {
          count: "*",
        },
      },
    });

  return c.json({
    ...album,
    listeners: _.get(summaries, "0.total", 1),
    tracks: tracks
      .map((track) => track.track_id)
      .sort((a, b) => a.track_number - b.track_number),
    tags: [],
  });
});

app.get("/users/:did/app.rocksky.song/:rkey", async (c) => {
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.song/${rkey}`;

  const track = await ctx.client.db.tracks
    .filter("uri", equals(uri))
    .getFirst();

  if (!track) {
    c.status(404);
    return c.text("Track not found");
  }

  const { summaries } = await ctx.client.db.user_tracks
    .select(["track_id.*"])
    .filter({
      "track_id.uri": equals(uri),
    })
    .summarize({
      summaries: {
        total: {
          count: "*",
        },
      },
    });

  return c.json({
    ...track,
    tags: [],
    listeners: _.get(summaries, "0.total", 1),
  });
});

app.get("/users/:did/app.rocksky.artist/:rkey/tracks", async (c) => {
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.artist/${rkey}`;
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const tracks = await ctx.client.db.artist_tracks
    .select(["track_id.*", "xata_version"])
    .filter({
      "artist_id.uri": equals(uri),
    })
    .sort("xata_version", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });
  return c.json(
    tracks.records.map((item) => ({
      ...item.track_id,
      xata_version: item.xata_version,
    }))
  );
});

app.get("/users/:did/app.rocksky.artist/:rkey/albums", async (c) => {
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.artist/${rkey}`;
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const albums = await ctx.client.db.artist_albums
    .select(["album_id.*", "xata_version"])
    .filter({
      "artist_id.uri": equals(uri),
    })
    .sort("xata_version", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });
  return c.json(
    albums.records.map((item) => ({
      ...item.album_id,
      xata_version: item.xata_version,
    }))
  );
});

app.get("/users/:did", async (c) => {
  const did = c.req.param("did");

  const user = await ctx.client.db.users
    .filter({
      $any: [{ did }, { handle: did }],
    })
    .getFirst();

  if (!user) {
    c.status(404);
    return c.text("User not found");
  }

  return c.json(user);
});

app.get("/users/:did/stats", async (c) => {
  const did = c.req.param("did");
  const scrobbles = await ctx.client.db.scrobbles
    .select(["user_id.*"])
    .filter({
      $any: [
        {
          "user_id.did": did,
        },
        {
          "user_id.handle": did,
        },
      ],
    })
    .summarize({
      summaries: {
        total: {
          count: "*",
        },
      },
    });

  const artists = await ctx.client.db.user_artists
    .select(["artist_id.*", "user_id.*"])
    .filter({
      $any: [
        {
          "user_id.did": did,
        },
        {
          "user_id.handle": did,
        },
      ],
    })
    .getAll();

  const lovedTracks = await ctx.client.db.loved_tracks
    .select(["track_id.*", "user_id.*"])
    .filter({
      $any: [
        {
          "user_id.did": did,
        },
        {
          "user_id.handle": did,
        },
      ],
    })
    .getAll();

  return c.json({
    scrobbles: _.get(scrobbles, "summaries.0.total", 1),
    artists: artists.length,
    lovedTracks: lovedTracks.length,
  });
});

serve({
  fetch: app.fetch,
  port: 8000,
});
