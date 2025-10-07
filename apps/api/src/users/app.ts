import type { BlobRef } from "@atproto/lexicon";
import { ctx } from "context";
import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import * as Profile from "lexicon/types/app/bsky/actor/profile";
import { createAgent } from "lib/agent";
import { env } from "lib/env";
import { likeTrack, unLikeTrack } from "lovedtracks/lovedtracks.service";
import { requestCounter } from "metrics";
import * as R from "ramda";
import tables from "schema";
import { SelectUser } from "schema/users";
import {
  createShout,
  likeShout,
  replyShout,
  unlikeShout,
} from "shouts/shouts.service";
import { shoutSchema } from "types/shout";
import type { Track } from "types/track";
import { dedupeTracksKeepLyrics } from "./utils";

const app = new Hono();

app.get("/:did/likes", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did/likes" });
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const lovedTracks = await ctx.db
    .select()
    .from(tables.lovedTracks)
    .leftJoin(tables.tracks, eq(tables.lovedTracks.trackId, tables.tracks.id))
    .leftJoin(tables.users, eq(tables.lovedTracks.userId, tables.users.id))
    .where(or(eq(tables.users.did, did), eq(tables.users.handle, did)))
    .orderBy(desc(tables.lovedTracks.createdAt))
    .limit(size)
    .offset(offset)
    .execute();

  return c.json(lovedTracks);
});

app.get("/:handle/scrobbles", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:handle/scrobbles" });
  const handle = c.req.param("handle");

  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const { data } = await ctx.analytics.post("library.getScrobbles", {
    user_did: handle,
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(data);
});

app.get("/:did/albums", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did/albums" });
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const { data } = await ctx.analytics.post("library.getTopAlbums", {
    user_did: did,
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(data.map((item) => ({ ...item, tags: [] })));
});

app.get("/:did/artists", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did/artists" });
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const { data } = await ctx.analytics.post("library.getTopArtists", {
    user_did: did,
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(data.map((item) => ({ ...item, tags: [] })));
});

app.get("/:did/tracks", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did/tracks" });
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const { data } = await ctx.analytics.post("library.getTopTracks", {
    user_did: did,
    pagination: {
      skip: offset,
      take: size,
    },
  });

  return c.json(
    data.map((item) => ({
      ...item,
      tags: [],
    }))
  );
});

app.get("/:did/playlists", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did/playlists" });
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const results = await ctx.db
    .select({
      playlists: tables.playlists,
      trackCount: sql<number>`
      (SELECT COUNT(*)
       FROM ${tables.playlistTracks}
       WHERE ${tables.playlistTracks.playlistId} = ${tables.playlists.id}
      )`.as("trackCount"),
    })
    .from(tables.playlists)
    .leftJoin(tables.users, eq(tables.playlists.createdBy, tables.users.id))
    .where(or(eq(tables.users.did, did), eq(tables.users.handle, did)))
    .offset(offset)
    .limit(size)
    .execute();

  return c.json(
    results.map((x) => ({
      ...x.playlists,
      trackCount: +x.trackCount,
    }))
  );
});

app.get("/:did/app.rocksky.scrobble/:rkey", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.scrobble/:rkey",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.scrobble/${rkey}`;

  const scrobble = await ctx.db
    .select()
    .from(tables.scrobbles)
    .leftJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
    .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
    .where(eq(tables.scrobbles.uri, uri))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!scrobble) {
    c.status(404);
    return c.text("Scrobble not found");
  }

  const [listeners, scrobbles] = await Promise.all([
    ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tables.userTracks)
      .where(eq(tables.userTracks.trackId, scrobble.tracks.id))
      .execute()
      .then((rows) => rows[0].count),
    ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tables.scrobbles)
      .where(eq(tables.scrobbles.trackId, scrobble.tracks.id))
      .execute()
      .then((rows) => rows[0].count),
  ]);

  return c.json({
    ...scrobble,
    id: scrobble.scrobbles.id,
    listeners: listeners || 1,
    scrobbles: scrobbles || 1,
    tags: [],
  });
});

app.get("/:did/app.rocksky.artist/:rkey", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.artist/:rkey",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.artist/${rkey}`;

  const artist = await ctx.db
    .select()
    .from(tables.userArtists)
    .leftJoin(
      tables.artists,
      eq(tables.userArtists.artistId, tables.artists.id)
    )
    .where(or(eq(tables.userArtists.uri, uri), eq(tables.artists.uri, uri)))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!artist) {
    c.status(404);
    return c.text("Artist not found");
  }

  const [listeners, scrobbles] = await Promise.all([
    ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tables.userArtists)
      .where(eq(tables.userArtists.artistId, artist.artists.id))
      .execute()
      .then((rows) => rows[0].count),
    ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tables.scrobbles)
      .where(eq(tables.scrobbles.artistId, artist.artists.id))
      .execute()
      .then((rows) => rows[0].count),
  ]);

  return c.json({
    ...R.omit(["id"], artist.artists),
    id: artist.artists.id,
    listeners: listeners || 1,
    scrobbles: scrobbles || 1,
    tags: [],
  });
});

app.get("/:did/app.rocksky.album/:rkey", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.album/:rkey",
  });

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.album/${rkey}`;

  const album = await ctx.db
    .select()
    .from(tables.userAlbums)
    .leftJoin(tables.albums, eq(tables.userAlbums.albumId, tables.albums.id))
    .where(or(eq(tables.userAlbums.uri, uri), eq(tables.albums.uri, uri)))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!album) {
    c.status(404);
    return c.text("Album not found");
  }

  const tracks = await ctx.db
    .select()
    .from(tables.albumTracks)
    .leftJoin(tables.tracks, eq(tables.albumTracks.trackId, tables.tracks.id))
    .where(eq(tables.albumTracks.albumId, album.albums.id))
    .orderBy(asc(tables.tracks.trackNumber))
    .execute();

  const [listeners, scrobbles] = await Promise.all([
    ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tables.userAlbums)
      .where(eq(tables.userAlbums.albumId, album.albums.id))
      .execute()
      .then((rows) => rows[0].count),
    ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tables.scrobbles)
      .where(eq(tables.scrobbles.albumId, album.albums.id))
      .execute()
      .then((rows) => rows[0].count),
  ]);

  return c.json({
    ...R.omit(["id"], album.albums),
    id: album.albums.id,
    listeners: listeners || 1,
    scrobbles: scrobbles || 1,
    label: tracks[0]?.tracks.label || "",
    tracks: dedupeTracksKeepLyrics(tracks.map((track) => track.tracks)).sort(
      (a, b) => a.track_number - b.track_number
    ),
    tags: [],
  });
});

app.get("/:did/app.rocksky.song/:rkey", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.song/:rkey",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.song/${rkey}`;

  const [_track, user_track] = await Promise.all([
    ctx.db
      .select()
      .from(tables.tracks)
      .where(eq(tables.tracks.uri, uri))
      .limit(1)
      .execute()
      .then((rows) => rows[0]),
    ctx.db
      .select()
      .from(tables.userTracks)
      .leftJoin(tables.tracks, eq(tables.userTracks.trackId, tables.tracks.id))
      .where(eq(tables.userTracks.uri, uri))
      .limit(1)
      .execute()
      .then((rows) => rows[0]),
  ]);
  const track = _track || user_track?.tracks;

  if (!track) {
    c.status(404);
    return c.text("Track not found");
  }

  const [listeners, scrobbles] = await Promise.all([
    ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tables.userTracks)
      .where(eq(tables.userTracks.trackId, track.id))
      .execute()
      .then((rows) => rows[0].count),
    ctx.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tables.scrobbles)
      .where(eq(tables.scrobbles.trackId, track.id))
      .execute()
      .then((rows) => rows[0].count),
  ]);

  return c.json({
    ...R.omit(["id"], track),
    id: track.id,
    tags: [],
    listeners: listeners || 1,
    scrobbles: scrobbles || 1,
  });
});

app.get("/:did/app.rocksky.artist/:rkey/tracks", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.artist/:rkey/tracks",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.artist/${rkey}`;
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const tracks = await ctx.db
    .select()
    .from(tables.artistTracks)
    .leftJoin(tables.tracks, eq(tables.artistTracks.trackId, tables.tracks.id))
    .where(eq(tables.artistTracks.artistId, uri)) // Assuming artist_id is the URI or ID; adjust if needed
    .orderBy(desc(tables.artistTracks.xataVersion))
    .limit(size)
    .offset(offset)
    .execute();

  return c.json(
    tracks.map((item) => ({
      ...R.omit(["id"], item.tracks),
      id: item.tracks.id,
      xata_version: item.artist_tracks.xataVersion,
    }))
  );
});

app.get("/:did/app.rocksky.artist/:rkey/albums", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.artist/:rkey/albums",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.artist/${rkey}`;
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

  const albums = await ctx.db
    .select()
    .from(tables.artistAlbums)
    .leftJoin(tables.albums, eq(tables.artistAlbums.albumId, tables.albums.id))
    .where(eq(tables.artistAlbums.artistId, uri)) // Assuming artist_id is the URI or ID; adjust if needed
    .orderBy(desc(tables.artistAlbums.xataVersion))
    .limit(size)
    .offset(offset)
    .execute();

  return c.json(
    R.uniqBy(
      (item) => item.id,
      albums.map((item) => ({
        ...R.omit(["id"], item.albums),
        id: item.albums.id,
        xata_version: item.artist_albums.xataVersion,
      }))
    )
  );
});

app.get("/:did/app.rocksky.playlist/:rkey", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.playlist/:rkey",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const uri = `at://${did}/app.rocksky.playlist/${rkey}`;

  const playlist = await ctx.db
    .select()
    .from(tables.playlists)
    .leftJoin(tables.users, eq(tables.playlists.createdBy, tables.users.id))
    .where(eq(tables.playlists.uri, uri))
    .execute();

  if (!playlist.length) {
    c.status(404);
    return c.text("Playlist not found");
  }

  const results = await ctx.db
    .select()
    .from(tables.playlistTracks)
    .leftJoin(
      tables.playlists,
      eq(tables.playlistTracks.playlistId, tables.playlists.id)
    )
    .leftJoin(
      tables.tracks,
      eq(tables.playlistTracks.trackId, tables.tracks.id)
    )
    .where(eq(tables.playlists.uri, uri))
    .groupBy(
      tables.playlistTracks.id,
      tables.playlistTracks.playlistId,
      tables.playlistTracks.trackId,
      tables.playlistTracks.createdAt,
      tables.tracks.id,
      tables.tracks.title,
      tables.tracks.artist,
      tables.tracks.albumArtist,
      tables.tracks.albumArt,
      tables.tracks.album,
      tables.tracks.trackNumber,
      tables.tracks.duration,
      tables.tracks.mbId,
      tables.tracks.youtubeLink,
      tables.tracks.spotifyLink,
      tables.tracks.appleMusicLink,
      tables.tracks.tidalLink,
      tables.tracks.sha256,
      tables.tracks.discNumber,
      tables.tracks.lyrics,
      tables.tracks.composer,
      tables.tracks.genre,
      tables.tracks.copyrightMessage,
      tables.tracks.uri,
      tables.tracks.albumUri,
      tables.tracks.artistUri,
      tables.tracks.createdAt,
      tables.tracks.updatedAt,
      tables.tracks.label,
      tables.tracks.xataVersion,
      tables.playlists.updatedAt,
      tables.playlists.id,
      tables.playlists.createdAt,
      tables.playlists.name,
      tables.playlists.description,
      tables.playlists.uri,
      tables.playlists.createdBy,
      tables.playlists.picture,
      tables.playlists.spotifyLink,
      tables.playlists.tidalLink,
      tables.playlists.appleMusicLink
    )
    .orderBy(asc(tables.playlistTracks.createdAt))
    .execute();

  return c.json({
    ...playlist[0].playlists,
    curatedBy: playlist[0].users,
    tracks: results.map((x) => x.tracks),
  });
});

app.get("/:did", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did" });
  const did = c.req.param("did");
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();
  if (bearer && bearer !== "null") {
    const claims = jwt.verify(bearer, env.JWT_SECRET, {
      ignoreExpiration: true,
    });
    const agent = await createAgent(ctx.oauthClient, claims.did);

    if (agent) {
      const { data: profileRecord } = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: "app.bsky.actor.profile",
        rkey: "self",
      });
      const handle = await ctx.resolver.resolveDidToHandle(did);
      const profile: {
        handle?: string;
        displayName?: string;
        avatar?: BlobRef;
      } =
        Profile.isRecord(profileRecord.value) &&
        Profile.validateRecord(profileRecord.value).success
          ? { ...profileRecord.value, handle }
          : {};

      if (profile.handle) {
        await ctx.db
          .update(tables.users)
          .set({
            handle,
            displayName: profile.displayName,
            avatar: `https://cdn.bsky.app/img/avatar/plain/${did}/${profile.avatar.ref.toString()}@jpeg`,
          })
          .where(eq(tables.users.did, did))
          .execute();

        const user = await ctx.db
          .select()
          .from(tables.users)
          .where(eq(tables.users.did, did))
          .limit(1)
          .execute()
          .then((rows) => rows[0]);

        ctx.nc.publish("rocksky.user", Buffer.from(JSON.stringify(user)));
      }
    }
  }

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(or(eq(tables.users.did, did), eq(tables.users.handle, did)))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!user) {
    c.status(404);
    return c.text("User not found");
  }

  return c.json(user);
});

app.post("/:did/app.rocksky.artist/:rkey/shouts", async (c) => {
  requestCounter.add(1, {
    method: "POST",
    route: "/users/:did/app.rocksky.artist/:rkey/shouts",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const body = await c.req.json();
  const parsed = shoutSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid shout data: " + parsed.error.message);
  }

  await createShout(
    ctx,
    parsed.data,
    `at://${did}/app.rocksky.artist/${rkey}`,
    user,
    agent
  );
  return c.json({});
});

app.post("/:did/app.rocksky.album/:rkey/shouts", async (c) => {
  requestCounter.add(1, {
    method: "POST",
    route: "/users/:did/app.rocksky.album/:rkey/shouts",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const body = await c.req.json();
  const parsed = shoutSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid shout data: " + parsed.error.message);
  }

  await createShout(
    ctx,
    parsed.data,
    `at://${did}/app.rocksky.album/${rkey}`,
    user,
    agent
  );
  return c.json({});
});

app.post("/:did/app.rocksky.song/:rkey/shouts", async (c) => {
  requestCounter.add(1, {
    method: "POST",
    route: "/users/:did/app.rocksky.song/:rkey/shouts",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const body = await c.req.json();

  const parsed = shoutSchema.safeParse(body);
  if (parsed.error) {
    c.status(400);
    return c.text("Invalid shout data: " + parsed.error.message);
  }

  await createShout(
    ctx,
    parsed.data,
    `at://${did}/app.rocksky.song/${rkey}`,
    user,
    agent
  );

  return c.json({});
});

app.post("/:did/app.rocksky.scrobble/:rkey/shouts", async (c) => {
  requestCounter.add(1, {
    method: "POST",
    route: "/users/:did/app.rocksky.scrobble/:rkey/shouts",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const body = await c.req.json();

  const parsed = shoutSchema.safeParse(body);
  if (parsed.error) {
    c.status(400);
    return c.text("Invalid shout data: " + parsed.error.message);
  }

  await createShout(
    ctx,
    parsed.data,
    `at://${did}/app.rocksky.scrobble/${rkey}`,
    user,
    agent
  );

  return c.json({});
});

app.post("/:did/shouts", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/users/:did/shouts" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const body = await c.req.json();
  const parsed = shoutSchema.safeParse(body);
  if (parsed.error) {
    c.status(400);
    return c.text("Invalid shout data: " + parsed.error.message);
  }

  const _user = await ctx.db
    .select()
    .from(tables.users)
    .where(or(eq(tables.users.did, did), eq(tables.users.handle, did)))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!_user) {
    c.status(404);
    return c.text("User not found");
  }

  await createShout(ctx, parsed.data, `at://${_user.did}`, user, agent);

  return c.json({});
});

app.post("/:did/app.rocksky.shout/:rkey/likes", async (c) => {
  requestCounter.add(1, {
    method: "POST",
    route: "/users/:did/app.rocksky.shout/:rkey/likes",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  await likeShout(ctx, `at://${did}/app.rocksky.shout/${rkey}`, user, agent);

  return c.json({});
});

app.delete("/:did/app.rocksky.shout/:rkey/likes", async (c) => {
  requestCounter.add(1, {
    method: "DELETE",
    route: "/users/:did/app.rocksky.shout/:rkey/likes",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  await unlikeShout(ctx, `at://${did}/app.rocksky.shout/${rkey}`, user, agent);

  return c.json({});
});

app.post("/:did/app.rocksky.song/:rkey/likes", async (c) => {
  requestCounter.add(1, {
    method: "POST",
    route: "/users/:did/app.rocksky.song/:rkey/likes",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const result = await ctx.db
    .select()
    .from(tables.tracks)
    .where(eq(tables.tracks.uri, `at://${did}/app.rocksky.song/${rkey}`))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  const track: Track = {
    title: result.title,
    artist: result.artist,
    album: result.album,
    albumArt: result.albumArt,
    albumArtist: result.albumArtist,
    trackNumber: result.trackNumber,
    duration: result.duration,
    composer: result.composer,
    lyrics: result.lyrics,
    discNumber: result.discNumber,
  };
  await likeTrack(ctx, track, user, agent);

  return c.json({});
});

app.delete("/:did/app.rocksky.song/:rkey/likes", async (c) => {
  requestCounter.add(1, {
    method: "DELETE",
    route: "/users/:did/app.rocksky.song/:rkey/likes",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const track = await ctx.db
    .select()
    .from(tables.tracks)
    .where(eq(tables.tracks.uri, `at://${did}/app.rocksky.song/${rkey}`))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!track) {
    c.status(404);
    return c.text("Track not found");
  }

  await unLikeTrack(ctx, track.sha256, user, agent);

  return c.json([]);
});

app.post("/:did/app.rocksky.shout/:rkey/replies", async (c) => {
  requestCounter.add(1, {
    method: "POST",
    route: "/users/:did/app.rocksky.shout/:rkey/replies",
  });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const body = await c.req.json();
  const parsed = shoutSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid shout data: " + parsed.error.message);
  }

  await replyShout(
    ctx,
    parsed.data,
    `at://${did}/app.rocksky.shout/${rkey}`,
    user,
    agent
  );
  return c.json({});
});

app.get("/:did/app.rocksky.artist/:rkey/shouts", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.artist/:rkey/shouts",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  let user: SelectUser | undefined;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET, {
      ignoreExpiration: true,
    });

    user = await ctx.db
      .select()
      .from(tables.users)
      .where(eq(tables.users.did, payload.did))
      .limit(1)
      .execute()
      .then((rows) => rows[0]);
  }

  const shouts = await ctx.db
    .select({
      shouts: user
        ? {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            uri: tables.shouts.uri,
            parent: tables.shouts.parentId,
            likes: count(tables.shoutLikes.id).as("likes"),
            liked: sql<boolean>`
      EXISTS (
        SELECT 1
        FROM ${tables.shoutLikes}
        WHERE ${tables.shoutLikes}.shout_id = ${tables.shouts}.xata_id
          AND ${tables.shoutLikes}.user_id = ${user.id}
      )`.as("liked"),
          }
        : {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            parent: tables.shouts.parentId,
            uri: tables.shouts.uri,
            likes: count(tables.shoutLikes.id).as("likes"),
          },
      users: {
        id: tables.users.id,
        did: tables.users.did,
        handle: tables.users.handle,
        displayName: tables.users.displayName,
        avatar: tables.users.avatar,
      },
    })
    .from(tables.shouts)
    .leftJoin(tables.users, eq(tables.shouts.authorId, tables.users.id))
    .leftJoin(tables.artists, eq(tables.shouts.artistId, tables.artists.id))
    .leftJoin(
      tables.shoutLikes,
      eq(tables.shouts.id, tables.shoutLikes.shoutId)
    )
    .where(eq(tables.artists.uri, `at://${did}/app.rocksky.artist/${rkey}`))
    .groupBy(
      tables.shouts.id,
      tables.shouts.content,
      tables.shouts.createdAt,
      tables.shouts.uri,
      tables.shouts.parentId,
      tables.users.id,
      tables.users.did,
      tables.users.handle,
      tables.users.displayName,
      tables.users.avatar
    )
    .orderBy(desc(tables.shouts.createdAt))
    .execute();
  return c.json(shouts);
});

app.get("/:did/app.rocksky.album/:rkey/shouts", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.album/:rkey/shouts",
  });

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  let user: SelectUser | undefined;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET, {
      ignoreExpiration: true,
    });

    user = await ctx.db
      .select()
      .from(tables.users)
      .where(eq(tables.users.did, payload.did))
      .limit(1)
      .execute()
      .then((rows) => rows[0]);
  }

  const shouts = await ctx.db
    .select({
      shouts: user
        ? {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            parent: tables.shouts.parentId,
            uri: tables.shouts.uri,
            likes: count(tables.shoutLikes.id).as("likes"),
            liked: sql<boolean>`
      EXISTS (
        SELECT 1
        FROM ${tables.shoutLikes}
        WHERE ${tables.shoutLikes}.shout_id = ${tables.shouts}.xata_id
          AND ${tables.shoutLikes}.user_id = ${user.id}
      )`.as("liked"),
          }
        : {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            parent: tables.shouts.parentId,
            uri: tables.shouts.uri,
            likes: count(tables.shoutLikes.id).as("likes"),
          },
      users: {
        id: tables.users.id,
        did: tables.users.did,
        handle: tables.users.handle,
        displayName: tables.users.displayName,
        avatar: tables.users.avatar,
      },
    })
    .from(tables.shouts)
    .leftJoin(tables.users, eq(tables.shouts.authorId, tables.users.id))
    .leftJoin(tables.albums, eq(tables.shouts.albumId, tables.albums.id))
    .leftJoin(
      tables.shoutLikes,
      eq(tables.shouts.id, tables.shoutLikes.shoutId)
    )
    .where(eq(tables.albums.uri, `at://${did}/app.rocksky.album/${rkey}`))
    .groupBy(
      tables.shouts.id,
      tables.shouts.content,
      tables.shouts.createdAt,
      tables.shouts.uri,
      tables.shouts.parentId,
      tables.users.id,
      tables.users.did,
      tables.users.handle,
      tables.users.displayName,
      tables.users.avatar
    )
    .orderBy(desc(tables.shouts.createdAt))
    .execute();

  return c.json(shouts);
});

app.get("/:did/app.rocksky.song/:rkey/shouts", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.song/:rkey/shouts",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  let user: SelectUser | undefined;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET, {
      ignoreExpiration: true,
    });

    user = await ctx.db
      .select()
      .from(tables.users)
      .where(eq(tables.users.did, payload.did))
      .limit(1)
      .execute()
      .then((rows) => rows[0]);
  }

  const shouts = await ctx.db
    .select({
      shouts: user
        ? {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            uri: tables.shouts.uri,
            parent: tables.shouts.parentId,
            likes: count(tables.shoutLikes.id).as("likes"),
            liked: sql<boolean>`
      EXISTS (
        SELECT 1
        FROM ${tables.shoutLikes}
        WHERE ${tables.shoutLikes}.shout_id = ${tables.shouts}.xata_id
          AND ${tables.shoutLikes}.user_id = ${user.id}
      )`.as("liked"),
          }
        : {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            uri: tables.shouts.uri,
            parent: tables.shouts.parentId,
            likes: count(tables.shoutLikes.id).as("likes"),
          },
      users: {
        id: tables.users.id,
        did: tables.users.did,
        handle: tables.users.handle,
        displayName: tables.users.displayName,
        avatar: tables.users.avatar,
      },
    })
    .from(tables.shouts)
    .leftJoin(tables.users, eq(tables.shouts.authorId, tables.users.id))
    .leftJoin(tables.tracks, eq(tables.shouts.trackId, tables.tracks.id))
    .leftJoin(
      tables.shoutLikes,
      eq(tables.shouts.id, tables.shoutLikes.shoutId)
    )
    .where(eq(tables.tracks.uri, `at://${did}/app.rocksky.song/${rkey}`))
    .groupBy(
      tables.shouts.id,
      tables.shouts.content,
      tables.shouts.createdAt,
      tables.shouts.uri,
      tables.shouts.parentId,
      tables.users.id,
      tables.users.did,
      tables.users.handle,
      tables.users.displayName,
      tables.users.avatar
    )
    .orderBy(desc(tables.shouts.createdAt))
    .execute();

  return c.json(shouts);
});

app.get("/:did/app.rocksky.scrobble/:rkey/shouts", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.scrobble/:rkey/shouts",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  let user: SelectUser | undefined;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET, {
      ignoreExpiration: true,
    });

    user = await ctx.db
      .select()
      .from(tables.users)
      .where(eq(tables.users.did, payload.did))
      .limit(1)
      .execute()
      .then((rows) => rows[0]);
  }

  const shouts = await ctx.db
    .select({
      shouts: user
        ? {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            uri: tables.shouts.uri,
            parent: tables.shouts.parentId,
            likes: count(tables.shoutLikes.id).as("likes"),
            liked: sql<boolean>`
        EXISTS (
          SELECT 1
          FROM ${tables.shoutLikes}
          WHERE ${tables.shoutLikes}.shout_id = ${tables.shouts}.xata_id
            AND ${tables.shoutLikes}.user_id = ${user.id}
        )`.as("liked"),
          }
        : {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            uri: tables.shouts.uri,
            parent: tables.shouts.parentId,
            likes: count(tables.shoutLikes.id).as("likes"),
          },
      users: {
        id: tables.users.id,
        did: tables.users.did,
        handle: tables.users.handle,
        displayName: tables.users.displayName,
        avatar: tables.users.avatar,
      },
    })
    .from(tables.shouts)
    .leftJoin(tables.users, eq(tables.shouts.authorId, tables.users.id))
    .leftJoin(
      tables.scrobbles,
      eq(tables.shouts.scrobbleId, tables.scrobbles.id)
    )
    .leftJoin(
      tables.shoutLikes,
      eq(tables.shouts.id, tables.shoutLikes.shoutId)
    )
    .where(eq(tables.scrobbles.uri, `at://${did}/app.rocksky.scrobble/${rkey}`))
    .groupBy(
      tables.shouts.id,
      tables.shouts.content,
      tables.shouts.createdAt,
      tables.shouts.uri,
      tables.shouts.parentId,
      tables.users.id,
      tables.users.did,
      tables.users.handle,
      tables.users.displayName,
      tables.users.avatar
    )
    .orderBy(desc(tables.shouts.createdAt))
    .execute();

  return c.json(shouts);
});

app.get("/:did/shouts", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did/shouts" });
  const did = c.req.param("did");

  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  let user: SelectUser | undefined;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET, {
      ignoreExpiration: true,
    });

    user = await ctx.db
      .select()
      .from(tables.users)
      .where(eq(tables.users.did, payload.did))
      .limit(1)
      .execute()
      .then((rows) => rows[0]);
  }

  const shouts = await ctx.db
    .select({
      profileShouts: {
        id: tables.profileShouts.id,
        createdAt: tables.profileShouts.createdAt,
      },
      shouts: user
        ? {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            uri: tables.shouts.uri,
            parent: tables.shouts.parentId,
            likes: count(tables.shoutLikes.id).as("likes"),
            liked: sql<boolean>`
        EXISTS (
          SELECT 1
          FROM ${tables.shoutLikes}
          WHERE ${tables.shoutLikes}.shout_id = ${tables.shouts}.xata_id
            AND ${tables.shoutLikes}.user_id = ${user.id}
        )`.as("liked"),
            reported: sql<boolean>`
        EXISTS (
          SELECT 1
          FROM ${tables.shoutReports}
          WHERE ${tables.shoutReports}.shout_id = ${tables.shouts}.xata_id
            AND ${tables.shoutReports}.user_id = ${user.id}
        )`.as("reported"),
          }
        : {
            id: tables.shouts.id,
            content: tables.shouts.content,
            createdAt: tables.shouts.createdAt,
            uri: tables.shouts.uri,
            parent: tables.shouts.parentId,
            likes: count(tables.shoutLikes.id).as("likes"),
          },
      users: {
        id: aliasedTable(tables.users, "authors").id,
        did: aliasedTable(tables.users, "authors").did,
        handle: aliasedTable(tables.users, "authors").handle,
        displayName: aliasedTable(tables.users, "authors").displayName,
        avatar: aliasedTable(tables.users, "authors").avatar,
      },
    })
    .from(tables.profileShouts)
    .where(or(eq(tables.users.did, did), eq(tables.users.handle, did)))
    .leftJoin(tables.shouts, eq(tables.profileShouts.shoutId, tables.shouts.id))
    .leftJoin(
      aliasedTable(tables.users, "authors"),
      eq(tables.shouts.authorId, aliasedTable(tables.users, "authors").id)
    )
    .leftJoin(tables.users, eq(tables.profileShouts.userId, tables.users.id))
    .leftJoin(
      tables.shoutLikes,
      eq(tables.shouts.id, tables.shoutLikes.shoutId)
    )
    .groupBy(
      tables.profileShouts.id,
      tables.profileShouts.createdAt,
      tables.shouts.id,
      tables.shouts.uri,
      tables.shouts.content,
      tables.shouts.createdAt,
      tables.shouts.parentId,
      tables.users.id,
      tables.users.did,
      tables.users.handle,
      tables.users.displayName,
      tables.users.avatar,
      aliasedTable(tables.users, "authors").id,
      aliasedTable(tables.users, "authors").did,
      aliasedTable(tables.users, "authors").handle,
      aliasedTable(tables.users, "authors").displayName,
      aliasedTable(tables.users, "authors").avatar
    )
    .orderBy(desc(tables.profileShouts.createdAt))
    .execute();

  return c.json(shouts);
});

app.get("/:did/app.rocksky.shout/:rkey/likes", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.shout/:rkey/likes",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const likes = await ctx.db
    .select()
    .from(tables.shoutLikes)
    .leftJoin(tables.users, eq(tables.shoutLikes.userId, tables.users.id))
    .leftJoin(tables.shouts, eq(tables.shoutLikes.shoutId, tables.shouts.id))
    .where(eq(tables.shouts.uri, `at://${did}/app.rocksky.shout/${rkey}`))
    .execute();
  return c.json(likes);
});

app.get("/:did/app.rocksky.shout/:rkey/replies", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.shout/:rkey/replies",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const shouts = await ctx.db
    .select()
    .from(tables.shouts)
    .leftJoin(tables.users, eq(tables.shouts.authorId, tables.users.id))
    .where(eq(tables.shouts.parentId, `at://${did}/app.rocksky.shout/${rkey}`))
    .orderBy(asc(tables.shouts.createdAt))
    .execute();
  return c.json(shouts);
});

app.get("/:did/stats", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did/stats" });
  const did = c.req.param("did");

  const { data } = await ctx.analytics.post("library.getStats", {
    user_did: did,
  });

  return c.json({
    scrobbles: data.scrobbles,
    artists: data.artists,
    lovedTracks: data.loved_tracks,
    albums: data.albums,
    tracks: data.tracks,
  });
});

app.post("/:did/app.rocksky.shout/:rkey/report", async (c) => {
  requestCounter.add(1, {
    method: "POST",
    route: "/users/:did/app.rocksky.shout/:rkey/report",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const shout = await ctx.db
    .select()
    .from(tables.shouts)
    .where(eq(tables.shouts.uri, `at://${did}/app.rocksky.shout/${rkey}`))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!shout) {
    c.status(404);
    return c.text("Shout not found");
  }

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const existingReport = await ctx.db
    .select()
    .from(tables.shoutReports)
    .where(
      and(
        eq(tables.shoutReports.userId, user.id),
        eq(tables.shoutReports.shoutId, shout.id)
      )
    )
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (existingReport) {
    return c.json(existingReport);
  }

  const report = await ctx.db
    .insert(tables.shoutReports)
    .values({
      userId: user.id,
      shoutId: shout.id,
    })
    .returning()
    .execute()
    .then((rows) => rows[0]);

  return c.json(report);
});

app.delete("/:did/app.rocksky.shout/:rkey/report", async (c) => {
  requestCounter.add(1, {
    method: "DELETE",
    route: "/users/:did/app.rocksky.shout/:rkey/report",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const shout = await ctx.db
    .select()
    .from(tables.shouts)
    .where(eq(tables.shouts.uri, `at://${did}/app.rocksky.shout/${rkey}`))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!shout) {
    c.status(404);
    return c.text("Shout not found");
  }

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const report = await ctx.db
    .select()
    .from(tables.shoutReports)
    .where(
      and(
        eq(tables.shoutReports.userId, user.id),
        eq(tables.shoutReports.shoutId, shout.id)
      )
    )
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!report) {
    c.status(404);
    return c.text("Report not found");
  }

  if (report.userId !== user.id) {
    c.status(403);
    return c.text("Forbidden");
  }

  await ctx.db
    .delete(tables.shoutReports)
    .where(eq(tables.shoutReports.id, report.id))
    .execute();

  return c.json(report);
});

app.delete("/:did/app.rocksky.shout/:rkey", async (c) => {
  requestCounter.add(1, {
    method: "DELETE",
    route: "/users/:did/app.rocksky.shout/:rkey",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.did, payload.did))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const shout = await ctx.db
    .select()
    .from(tables.shouts)
    .where(eq(tables.shouts.uri, `at://${did}/app.rocksky.shout/${rkey}`))
    .limit(1)
    .execute()
    .then((rows) => rows[0]);

  if (!shout) {
    c.status(404);
    return c.text("Shout not found");
  }

  if (shout.authorId !== user.id) {
    c.status(403);
    return c.text("Forbidden");
  }

  const replies = await ctx.db
    .select({
      replies: {
        id: tables.shouts.id,
      },
    })
    .from(tables.shouts)
    .where(eq(tables.shouts.parentId, shout.id))
    .execute();

  const replyIds = replies.map(({ replies: r }) => r.id);

  // Delete related records in the correct order
  await ctx.db
    .delete(tables.shoutLikes)
    .where(inArray(tables.shoutLikes.shoutId, replyIds))
    .execute();

  await ctx.db
    .delete(tables.shoutReports)
    .where(inArray(tables.shoutReports.shoutId, replyIds))
    .execute();

  await ctx.db
    .delete(tables.profileShouts)
    .where(eq(tables.profileShouts.shoutId, shout.id))
    .execute();

  await ctx.db
    .delete(tables.profileShouts)
    .where(inArray(tables.profileShouts.shoutId, replyIds))
    .execute();

  await ctx.db
    .delete(tables.shoutLikes)
    .where(eq(tables.shoutLikes.shoutId, shout.id))
    .execute();

  await ctx.db
    .delete(tables.shoutReports)
    .where(eq(tables.shoutReports.shoutId, shout.id))
    .execute();

  await ctx.db
    .delete(tables.shouts)
    .where(inArray(tables.shouts.id, replyIds))
    .execute();

  await ctx.db
    .delete(tables.shouts)
    .where(eq(tables.shouts.id, shout.id))
    .execute();

  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection: "app.rocksky.shout",
    rkey: shout.uri.split("/").pop(),
  });

  return c.json(shout);
});

export default app;
