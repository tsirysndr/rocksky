import { type Agent, AtpAgent } from "@atproto/api";
import { TID } from "@atproto/common";
import type { Context } from "context";
import { and, eq } from "drizzle-orm";
import * as LikeLexicon from "lexicon/types/app/rocksky/like";
import * as ShoutLexicon from "lexicon/types/app/rocksky/shout";
import { validateMain } from "lexicon/types/com/atproto/repo/strongRef";
import _ from "lodash";
import type { Shout } from "types/shout";
import albums, { type SelectAlbum } from "../schema/albums";
import artists, { type SelectArtist } from "../schema/artists";
import profileShouts from "../schema/profile-shouts";
import scrobbles, { type SelectScrobble } from "../schema/scrobbles";
import shoutLikes from "../schema/shout-likes";
import shouts from "../schema/shouts";
import tracks, { type SelectTrack } from "../schema/tracks";
import users, { type SelectUser } from "../schema/users";

export async function createShout(
  ctx: Context,
  shout: Shout,
  uri: string,
  user,
  agent: Agent,
) {
  let album: SelectAlbum,
    artist: SelectArtist,
    track: SelectTrack,
    scrobble: {
      scrobble: SelectScrobble;
      track: SelectTrack;
      album: SelectAlbum;
      artist: SelectArtist;
    },
    profile: SelectUser,
    collection: string;

  if (uri.includes("app.rocksky.song")) {
    track = await ctx.db
      .select()
      .from(tracks)
      .where(eq(tracks.uri, uri))
      .limit(1)
      .then((rows) => rows[0]);
    collection = "app.rocksky.song";
  } else if (uri.includes("app.rocksky.album")) {
    album = await ctx.db
      .select()
      .from(albums)
      .where(eq(albums.uri, uri))
      .limit(1)
      .then((rows) => rows[0]);
    collection = "app.rocksky.album";
  } else if (uri.includes("app.rocksky.artist")) {
    artist = await ctx.db
      .select()
      .from(artists)
      .where(eq(artists.uri, uri))
      .limit(1)
      .then((rows) => rows[0]);
    collection = "app.rocksky.artist";
  } else if (uri.includes("app.rocksky.scrobble")) {
    scrobble = await ctx.db
      .select({
        scrobble: scrobbles,
        track: tracks,
        album: albums,
        artist: artists,
      })
      .from(scrobbles)
      .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
      .innerJoin(albums, eq(scrobbles.albumId, albums.id))
      .innerJoin(artists, eq(scrobbles.artistId, artists.id))
      .where(eq(scrobbles.uri, uri))
      .limit(1)
      .then((rows) => rows[0]);
    collection = "app.rocksky.scrobble";
  } else {
    profile = await ctx.db
      .select()
      .from(users)
      .where(eq(users.did, uri.split("at://").pop()))
      .limit(1)
      .then((rows) => rows[0]);
    collection = "app.bsky.actor.profile";
  }

  const subjectUri =
    album?.uri || track?.uri || artist?.uri || scrobble?.scrobble.uri || "self";
  const subjectRecord = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection,
    rkey: subjectUri !== "self" ? subjectUri.split("/").pop() : "self",
  });

  const subjectRef = validateMain({
    uri: subjectRecord.data.uri,
    cid: subjectRecord.data.cid,
  });
  if (!subjectRef.success) {
    console.log(subjectRef);
    throw new Error("Invalid ref");
  }

  const rkey = TID.nextStr();
  const record = {
    $type: "app.rocksky.shout",
    subject: subjectRef.value,
    message: shout.message,
    createdAt: new Date().toISOString(),
  };

  if (!ShoutLexicon.validateRecord(record).success) {
    console.log(ShoutLexicon.validateRecord(record));
    throw new Error("[shout] invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.createRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.shout",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;

    console.log(`Shout record created at: ${uri}`);

    const createdShout = await ctx.db
      .insert(shouts)
      .values({
        content: shout.message,
        uri,
        authorId: user.id,
        albumId: album?.id,
        artistId: artist?.id,
        trackId: track?.id,
        scrobbleId: scrobble?.scrobble.id,
      })
      .returning()
      .then((rows) => rows[0]);

    if (profile) {
      await ctx.db.insert(profileShouts).values({
        shoutId: createdShout.id,
        userId: profile.id,
      });
    }
  } catch (e) {
    console.error(`Error creating shout record: ${e.message}`);
  }
}

export async function replyShout(
  ctx: Context,
  reply: Shout,
  shoutUri: string,
  user,
  agent: Agent,
) {
  const shout = await ctx.db
    .select({
      shout: shouts,
      track: tracks,
      album: albums,
      artist: artists,
      scrobble: scrobbles,
    })
    .from(shouts)
    .leftJoin(tracks, eq(shouts.trackId, tracks.id))
    .leftJoin(albums, eq(shouts.albumId, albums.id))
    .leftJoin(artists, eq(shouts.artistId, artists.id))
    .leftJoin(scrobbles, eq(shouts.scrobbleId, scrobbles.id))
    .where(eq(shouts.uri, shoutUri))
    .limit(1)
    .then((rows) => rows[0]);

  if (!shout) {
    throw new Error("Shout not found");
  }

  const { data: profileRecord } = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: "app.bsky.actor.profile",
    rkey: "self",
  });

  let collection = "app.bsky.actor.profile";

  if (shout.track) {
    collection = "app.rocksky.song";
  }

  if (shout.album) {
    collection = "app.rocksky.album";
  }

  if (shout.artist) {
    collection = "app.rocksky.artist";
  }

  if (shout.scrobble) {
    collection = "app.rocksky.scrobble";
  }

  const subjectUri =
    shout.track?.uri ||
    shout.album?.uri ||
    shout.artist?.uri ||
    shout.scrobble?.uri ||
    profileRecord.uri;

  let service = await fetch(
    `https://plc.directory/${subjectUri.split("/").slice(0, 3).join("/").split("at://")[1]}`,
  )
    .then((res) => res.json<{ service: { seviceEndpoint: string }[] }>())
    .then((data) => data.service);

  let atpAgent = new AtpAgent({
    service: _.get(service, "0.serviceEndpoint"),
  });

  const subjectRecord = await atpAgent.com.atproto.repo.getRecord({
    repo: subjectUri.split("/").slice(0, 3).join("/").split("at://")[1],
    collection,
    rkey: subjectUri.split("/").pop(),
  });

  const subjectRef = validateMain({
    uri: subjectUri,
    cid: subjectRecord.data.cid,
  });
  if (!subjectRef.success) {
    throw new Error("[reply] invalid ref");
  }

  service = await fetch(
    `https://plc.directory/${shoutUri.split("/").slice(0, 3).join("/").split("at://")[1]}`,
  )
    .then((res) => res.json<{ service: { seviceEndpoint: string }[] }>())
    .then((data) => data.service);

  atpAgent = new AtpAgent({
    service: _.get(service, "0.serviceEndpoint"),
  });

  const parentRecord = await atpAgent.com.atproto.repo.getRecord({
    repo: shoutUri.split("/").slice(0, 3).join("/").split("at://")[1],
    collection: "app.rocksky.shout",
    rkey: shoutUri.split("/").pop(),
  });

  const parentRef = validateMain({
    uri: shout.shout.uri,
    cid: parentRecord.data.cid,
  });
  if (!parentRef.success) {
    throw new Error("[reply] invalid ref");
  }

  const rkey = TID.nextStr();
  const record = {
    $type: "app.rocksky.shout",
    subject: subjectRef.value,
    parent: parentRef.value,
    message: reply.message,
    createdAt: new Date().toISOString(),
  };

  if (!ShoutLexicon.validateRecord(record).success) {
    console.log(ShoutLexicon.validateRecord(record));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.createRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.shout",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;

    console.log(`Reply record created at: ${uri}`);

    const createdShout = await ctx.db
      .insert(shouts)
      .values({
        content: reply.message,
        uri,
        parentId: shout.shout.id,
        authorId: user.id,
        trackId: shout.track?.id,
        albumId: shout.album?.id,
        artistId: shout.artist?.id,
        scrobbleId: shout.scrobble?.id,
      })
      .returning()
      .then((rows) => rows[0]);

    if (!shout.track && !shout.album && !shout.artist && !shout.scrobble) {
      const profileShout = await ctx.db
        .select()
        .from(profileShouts)
        .where(eq(profileShouts.shoutId, shout.shout.id))
        .limit(1)
        .then((rows) => rows[0]);

      await ctx.db.insert(profileShouts).values({
        shoutId: createdShout.id,
        userId: profileShout.userId,
      });
    }
  } catch (e) {
    console.error(`Error creating reply record: ${e.message}`);
  }
}

export async function likeShout(
  ctx: Context,
  shoutUri: string,
  user,
  agent: Agent,
) {
  const rkey = TID.nextStr();

  const likes = await ctx.db
    .select({
      like: shoutLikes,
      shout: shouts,
    })
    .from(shoutLikes)
    .innerJoin(shouts, eq(shoutLikes.shoutId, shouts.id))
    .where(and(eq(shouts.uri, shoutUri), eq(shoutLikes.userId, user.id)))
    .limit(1)
    .then((rows) => rows[0]);

  if (likes) {
    return;
  }

  const { service } = await fetch(
    `https://plc.directory/${shoutUri.split("/").slice(0, 3).join("/").split("at://")[1]}`,
  ).then((res) => res.json<{ service: [{ serviceEndpoint: string }] }>());

  const atpAgent = new AtpAgent({
    service: _.get(service, "0.serviceEndpoint"),
  });

  const subjectRecord = await atpAgent.com.atproto.repo.getRecord({
    repo: shoutUri.split("/").slice(0, 3).join("/").split("at://")[1],
    collection: "app.rocksky.shout",
    rkey: shoutUri.split("/").pop(),
  });

  const subjectRef = validateMain({
    uri: shoutUri,
    cid: subjectRecord.data.cid,
  });
  if (!subjectRef.success) {
    throw new Error("[like] invalid ref");
  }

  const record = {
    $type: "app.rocksky.like",
    subject: subjectRef.value,
    createdAt: new Date().toISOString(),
  };

  if (!LikeLexicon.validateRecord(record).success) {
    console.log(LikeLexicon.validateRecord(record));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.createRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.like",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    console.log(`Like record created at: ${uri}`);

    const shout = await ctx.db
      .select()
      .from(shouts)
      .where(eq(shouts.uri, shoutUri))
      .limit(1)
      .then((rows) => rows[0]);

    if (!shout) {
      throw new Error("Shout not found");
    }

    await ctx.db.insert(shoutLikes).values({
      shoutId: shout.id,
      userId: user.id,
      uri,
    });
  } catch (e) {
    console.error(`Error creating like record: ${e.message}`);
  }
}

export async function unlikeShout(
  ctx: Context,
  shoutUri: string,
  user,
  agent: Agent,
) {
  const likes = await ctx.db
    .select({
      like: shoutLikes,
      shout: shouts,
    })
    .from(shoutLikes)
    .innerJoin(shouts, eq(shoutLikes.shoutId, shouts.id))
    .where(and(eq(shouts.uri, shoutUri), eq(shoutLikes.userId, user.id)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!likes) {
    return;
  }

  const rkey = likes.like.uri.split("/").pop();

  await Promise.all([
    agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.like",
      rkey,
    }),
    ctx.db.delete(shoutLikes).where(eq(shoutLikes.id, likes.like.id)),
  ]);
}
