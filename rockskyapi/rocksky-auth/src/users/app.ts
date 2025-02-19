import { equals } from "@xata.io/client";
import { ctx } from "context";
import { count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { createAgent } from "lib/agent";
import { env } from "lib/env";
import _ from "lodash";
import { likeTrack } from "lovedtracks/lovedtracks.service";
import tables from "schema";
import {
  createShout,
  likeShout,
  replyShout,
  unlikeShout,
} from "shouts/shouts.service";
import { shoutSchema } from "types/shout";

const app = new Hono();

app.get("/:did/likes", async (c) => {
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

app.get("/:did/albums", async (c) => {
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

app.get("/:did/artists", async (c) => {
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

app.get("/:did/tracks", async (c) => {
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

app.get("/:did/app.rocksky.scrobble/:rkey", async (c) => {
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

app.get("/:did/app.rocksky.artist/:rkey", async (c) => {
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

app.get("/:did/app.rocksky.album/:rkey", async (c) => {
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

app.get("/:did/app.rocksky.song/:rkey", async (c) => {
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

app.get("/:did/app.rocksky.artist/:rkey/tracks", async (c) => {
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

app.get("/:did/app.rocksky.artist/:rkey/albums", async (c) => {
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

app.get("/:did", async (c) => {
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

app.post("/:did/app.rocksky.artist/:rkey/shouts", async (c) => {
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
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET);

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

  await likeTrack(ctx, track, user);

  return c.json({});
});

app.delete("/:did/app.rocksky.song/:rkey/likes", async (c) => {
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const payload = jwt.verify(bearer, env.JWT_SECRET);

  const user = await ctx.client.db.users
    .filter("did", equals(payload.did))
    .getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  return c.json([]);
});

app.post("/:did/app.rocksky.shout/:rkey/replies", async (c) => {
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
        id: tables.users.id,
        did: tables.users.did,
        handle: tables.users.handle,
        displayName: tables.users.displayName,
        avatar: tables.users.avatar,
      },
    })
    .from(tables.profileShouts)
    .where(or(eq(tables.users.did, did), eq(tables.users.handle, did)))
    .leftJoin(tables.users, eq(tables.profileShouts.userId, tables.users.id))
    .leftJoin(tables.shouts, eq(tables.profileShouts.shoutId, tables.shouts.id))
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
      tables.users.avatar
    )
    .orderBy(desc(tables.profileShouts.createdAt))
    .execute();

  return c.json(shouts);
});

app.get("/:did/app.rocksky.shout/:rkey/likes", async (c) => {
  const did = c.req.param("did");
  const rkey = c.req.param("rkey");
  const likes = await ctx.client.db.shout_likes
    .select(["user_id.*", "xata_createdat"])
    .filter("shout_id.uri", `at://${did}/app.rocksky.shout/${rkey}`)
    .getAll();
  return c.json(likes);
});

app.get("/:did/app.rocksky.shout/:rkey/replies", async (c) => {
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
    scrobbles: _.get(scrobbles, "summaries.0.total", 0),
    artists: artists.length,
    lovedTracks: lovedTracks.length,
  });
});

app.post("/:did/app.rocksky.shout/:rkey/report", async (c) => {
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
  await Promise.all([
    await ctx.db
      .delete(tables.shoutLikes)
      .where(inArray(tables.shoutLikes.shoutId, replyIds))
      .execute(),
    ctx.db
      .delete(tables.shoutReports)
      .where(inArray(tables.shoutReports.shoutId, replyIds))
      .execute(),
    ctx.db
      .delete(tables.profileShouts)
      .where(eq(tables.profileShouts.shoutId, shout.xata_id))
      .execute(),
    ctx.db
      .delete(tables.profileShouts)
      .where(inArray(tables.profileShouts.shoutId, replyIds))
      .execute(),
    ctx.db
      .delete(tables.shoutLikes)
      .where(eq(tables.shoutLikes.shoutId, shout.xata_id))
      .execute(),
    ctx.db
      .delete(tables.shoutReports)
      .where(eq(tables.shoutReports.shoutId, shout.xata_id))
      .execute(),
    ctx.db
      .delete(tables.shouts)
      .where(inArray(tables.shouts.id, replyIds))
      .execute(),
  ]);

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
