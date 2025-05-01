import { BlobRef } from "@atproto/lexicon";
import { equals } from "@xata.io/client";
import { ctx } from "context";
import {
  aliasedTable,
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
import _ from "lodash";
import { likeTrack, unLikeTrack } from "lovedtracks/lovedtracks.service";
import { requestCounter } from "metrics";
import * as R from "ramda";
import tables from "schema";
import {
  createShout,
  likeShout,
  replyShout,
  unlikeShout,
} from "shouts/shouts.service";
import { shoutSchema } from "types/shout";
import { Track } from "types/track";
import { dedupeTracksKeepLyrics } from "./utils";

const app = new Hono();

app.get("/:did/likes", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/users/:did/likes" });
  const did = c.req.param("did");
  const size = +c.req.query("size") || 10;
  const offset = +c.req.query("offset") || 0;

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
    .sort("xata_createdat", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });
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

  const scrobble = await ctx.client.db.scrobbles
    .select(["track_id.*", "user_id.*", "xata_createdat", "uri"])
    .filter("uri", equals(uri))
    .getFirst();

  if (!scrobble) {
    c.status(404);
    return c.text("Scrobble not found");
  }

  const [listeners, scrobbles] = await Promise.all([
    ctx.client.db.user_tracks.select(["track_id.*"]).summarize({
      filter: {
        "track_id.xata_id": scrobble.track_id.xata_id,
      },
      columns: ["track_id.*"],
      summaries: {
        total: {
          count: "*",
        },
      },
    }),
    ctx.client.db.scrobbles.select(["track_id.*", "xata_createdat"]).summarize({
      filter: {
        "track_id.xata_id": scrobble.track_id.xata_id,
      },
      columns: ["track_id.*"],
      summaries: {
        total: {
          count: "*",
        },
      },
    }),
  ]);

  return c.json({
    ...R.omit(["xata_id"], scrobble),
    id: scrobble.xata_id,
    listeners: _.get(listeners.summaries, "0.total", 1),
    scrobbles: _.get(scrobbles.summaries, "0.total", 1),
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

  const artist = await ctx.client.db.user_artists
    .select(["artist_id.*"])
    .filter({
      $any: [{ uri }, { "artist_id.uri": uri }],
    })
    .getFirst();

  if (!artist) {
    c.status(404);
    return c.text("Artist not found");
  }

  const [listeners, scrobbles] = await Promise.all([
    ctx.client.db.user_artists.select(["artist_id.*"]).summarize({
      filter: {
        "artist_id.xata_id": equals(artist.artist_id.xata_id),
      },
      columns: ["artist_id.*"],
      summaries: {
        total: {
          count: "*",
        },
      },
    }),
    ctx.client.db.scrobbles
      .select(["artist_id.*", "xata_createdat"])
      .summarize({
        filter: {
          "artist_id.xata_id": artist.artist_id.xata_id,
        },
        columns: ["artist_id.*"],
        summaries: {
          total: {
            count: "*",
          },
        },
      }),
  ]);

  return c.json({
    ...R.omit(["xata_id"], artist.artist_id),
    id: artist.artist_id.xata_id,
    listeners: _.get(listeners.summaries, "0.total", 1),
    scrobbles: _.get(scrobbles.summaries, "0.total", 1),
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

  const album = await ctx.client.db.user_albums
    .select(["album_id.*"])
    .filter({
      $any: [{ uri }, { "album_id.uri": uri }],
    })
    .getFirst();

  if (!album) {
    c.status(404);
    return c.text("Album not found");
  }

  const tracks = await ctx.client.db.album_tracks
    .select(["track_id.*"])
    .filter("album_id.xata_id", equals(album.album_id.xata_id))
    .sort("track_id.track_number", "asc")
    .getAll();

  const [listeners, scrobbles] = await Promise.all([
    ctx.client.db.user_albums.select(["album_id.*"]).summarize({
      filter: {
        "album_id.xata_id": equals(album.album_id.xata_id),
      },
      columns: ["album_id.*"],
      summaries: {
        total: {
          count: "*",
        },
      },
    }),
    ctx.client.db.scrobbles.select(["album_id.*", "xata_createdat"]).summarize({
      filter: {
        "album_id.xata_id": album.album_id.xata_id,
      },
      columns: ["album_id.*"],
      summaries: {
        total: {
          count: "*",
        },
      },
    }),
  ]);

  return c.json({
    ...R.omit(["xata_id"], album.album_id),
    id: album.album_id.xata_id,
    listeners: _.get(listeners.summaries, "0.total", 1),
    scrobbles: _.get(scrobbles.summaries, "0.total", 1),
    tracks: dedupeTracksKeepLyrics(tracks.map((track) => track.track_id)).sort(
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
    ctx.client.db.tracks.filter("uri", equals(uri)).getFirst(),
    ctx.client.db.user_tracks
      .select(["track_id.*"])
      .filter("uri", equals(uri))
      .getFirst(),
  ]);
  const track = _track || user_track.track_id;

  if (!track) {
    c.status(404);
    return c.text("Track not found");
  }

  const [listeners, scrobbles] = await Promise.all([
    ctx.client.db.user_tracks.select(["track_id.*"]).summarize({
      filter: {
        "track_id.xata_id": equals(track.xata_id),
      },
      columns: ["track_id.*"],
      summaries: {
        total: {
          count: "*",
        },
      },
    }),
    ctx.client.db.scrobbles.select(["track_id.*", "xata_createdat"]).summarize({
      filter: {
        "track_id.xata_id": track.xata_id,
      },
      columns: ["track_id.*"],
      summaries: {
        total: {
          count: "*",
        },
      },
    }),
  ]);

  return c.json({
    ...R.omit(["xata_id"], track),
    id: track.xata_id,
    tags: [],
    listeners: _.get(listeners.summaries, "0.total", 1),
    scrobbles: _.get(scrobbles.summaries, "0.total", 1),
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
      ...R.omit(["xata_id"], item.track_id),
      id: item.track_id.xata_id,
      xata_version: item.xata_version,
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
      ...R.omit(["xata_id"], item.album_id),
      id: item.album_id.xata_id,
      xata_version: item.xata_version,
    }))
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
    const claims = jwt.verify(bearer, env.JWT_SECRET);
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

        const user = await ctx.client.db.users
          .select(["*"])
          .filter("did", equals(did))
          .getFirst();

        ctx.nc.publish("rocksky.user", Buffer.from(JSON.stringify(user)));
      }
    }
  }

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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
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

  const _user = await ctx.client.db.users
    .filter({
      $any: [{ did }, { handle: did }],
    })
    .getFirst();

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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const result = await ctx.client.db.tracks
    .filter("uri", equals(`at://${did}/app.rocksky.song/${rkey}`))
    .getFirst();

  const track: Track = {
    title: result.title,
    artist: result.artist,
    album: result.album,
    albumArt: result.album_art,
    albumArtist: result.album_artist,
    trackNumber: result.track_number,
    duration: result.duration,
    composer: result.composer,
    lyrics: result.lyrics,
    discNumber: result.disc_number,
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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");

  const track = await ctx.client.db.tracks
    .filter("uri", equals(`at://${did}/app.rocksky.song/${rkey}`))
    .getFirst();

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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
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

  let user;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET);

    user = await ctx.client.db.users
      .filter("did", equals(payload.did))
      .getFirst();
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
          AND ${tables.shoutLikes}.user_id = ${user.xata_id}
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

  let user;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET);

    user = await ctx.client.db.users
      .filter("did", equals(payload.did))
      .getFirst();
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
          AND ${tables.shoutLikes}.user_id = ${user.xata_id}
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

  let user;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET);

    user = await ctx.client.db.users
      .filter("did", equals(payload.did))
      .getFirst();
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
          AND ${tables.shoutLikes}.user_id = ${user.xata_id}
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

  let user;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET);

    user = await ctx.client.db.users
      .filter("did", equals(payload.did))
      .getFirst();
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
            AND ${tables.shoutLikes}.user_id = ${user.xata_id}
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

  let user;
  if (bearer && bearer !== "null") {
    const payload = jwt.verify(bearer, env.JWT_SECRET);

    user = await ctx.client.db.users
      .filter("did", equals(payload.did))
      .getFirst();
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
            AND ${tables.shoutLikes}.user_id = ${user.xata_id}
        )`.as("liked"),
            reported: sql<boolean>`
        EXISTS (
          SELECT 1
          FROM ${tables.shoutReports}
          WHERE ${tables.shoutReports}.shout_id = ${tables.shouts}.xata_id
            AND ${tables.shoutReports}.user_id = ${user.xata_id}
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
  const likes = await ctx.client.db.shout_likes
    .select(["user_id.*", "xata_createdat"])
    .filter("shout_id.uri", `at://${did}/app.rocksky.shout/${rkey}`)
    .getAll();
  return c.json(likes);
});

app.get("/:did/app.rocksky.shout/:rkey/replies", async (c) => {
  requestCounter.add(1, {
    method: "GET",
    route: "/users/:did/app.rocksky.shout/:rkey/replies",
  });
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const shouts = await ctx.client.db.shouts
    .select(["author_id.*", "xata_createdat"])
    .filter("parent_id.uri", `at://${did}/app.rocksky.shout/${rkey}`)
    .sort("xata_createdat", "asc")
    .getAll();
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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const shout = await ctx.client.db.shouts
    .filter("uri", `at://${did}/app.rocksky.shout/${rkey}`)
    .getFirst();

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();

  if (!shout) {
    c.status(404);
    return c.text("Shout not found");
  }

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const existingReport = await ctx.client.db.shout_reports
    .filter({
      user_id: user.xata_id,
      shout_id: shout.xata_id,
    })
    .getFirst();

  if (existingReport) {
    return c.json(existingReport);
  }

  const report = await ctx.client.db.shout_reports.create({
    user_id: user.xata_id,
    shout_id: shout.xata_id,
  });

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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const shout = await ctx.client.db.shouts
    .filter("uri", `at://${did}/app.rocksky.shout/${rkey}`)
    .getFirst();

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();

  if (!shout) {
    c.status(404);
    return c.text("Shout not found");
  }

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const report = await ctx.client.db.shout_reports
    .select(["user_id.*", "shout_id.*"])
    .filter({
      user_id: user.xata_id,
      shout_id: shout.xata_id,
    })
    .getFirst();

  if (!report) {
    c.status(404);
    return c.text("Report not found");
  }

  if (report.user_id.xata_id !== user.xata_id) {
    c.status(403);
    return c.text("Forbidden");
  }

  await ctx.client.db.shout_reports.delete(report.xata_id);

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

  const payload = jwt.verify(bearer, env.JWT_SECRET);
  const agent = await createAgent(ctx.oauthClient, payload.did);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();

  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const shout = await ctx.client.db.shouts
    .select([
      "author_id.*",
      "uri",
      "content",
      "xata_id",
      "xata_createdat",
      "parent_id",
    ])
    .filter("uri", `at://${did}/app.rocksky.shout/${rkey}`)
    .getFirst();

  if (!shout) {
    c.status(404);
    return c.text("Shout not found");
  }

  if (shout.author_id.xata_id !== user.xata_id) {
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
    .where(eq(tables.shouts.parentId, shout.xata_id))
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
    .where(eq(tables.profileShouts.shoutId, shout.xata_id))
    .execute();

  await ctx.db
    .delete(tables.profileShouts)
    .where(inArray(tables.profileShouts.shoutId, replyIds))
    .execute();

  await ctx.db
    .delete(tables.shoutLikes)
    .where(eq(tables.shoutLikes.shoutId, shout.xata_id))
    .execute();

  await ctx.db
    .delete(tables.shoutReports)
    .where(eq(tables.shoutReports.shoutId, shout.xata_id))
    .execute();

  await ctx.db
    .delete(tables.shouts)
    .where(inArray(tables.shouts.id, replyIds))
    .execute();

  await ctx.db
    .delete(tables.shouts)
    .where(eq(tables.shouts.id, shout.xata_id))
    .execute();

  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid,
    collection: "app.rocksky.shout",
    rkey: shout.uri.split("/").pop(),
  });

  return c.json(shout);
});

export default app;
