import { Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import { Context } from "context";
import * as LikeLexicon from "lexicon/types/app/rocksky/like";
import * as ShoutLexicon from "lexicon/types/app/rocksky/shout";
import { validateMain } from "lexicon/types/com/atproto/repo/strongRef";
import { Shout } from "types/shout";

export async function createShout(
  ctx: Context,
  shout: Shout,
  uri: string,
  user,
  agent: Agent
) {
  let album, artist, track, scrobble, profile, collection;
  if (uri.includes("app.rocksky.song")) {
    track = await ctx.client.db.tracks.filter("uri", uri).getFirst();
    collection = "app.rocksky.song";
  } else if (uri.includes("app.rocksky.album")) {
    album = await ctx.client.db.albums.filter("uri", uri).getFirst();
    collection = "app.rocksky.album";
  } else if (uri.includes("app.rocksky.artist")) {
    artist = await ctx.client.db.artists.filter("uri", uri).getFirst();
    collection = "app.rocksky.artist";
  } else if (uri.includes("app.rocksky.scrobble")) {
    scrobble = await ctx.client.db.scrobbles
      .select(["track_id.*", "album_id.*", "artist_id.*", "uri"])
      .filter("uri", uri)
      .getFirst();
    collection = "app.rocksky.scrobble";
  } else {
    profile = await ctx.client.db.users
      .filter("did", uri.split("at://").pop())
      .getFirst();
    collection = "app.bsky.actor.profile";
  }

  const subjectUri =
    album?.uri || track?.uri || artist?.uri || scrobble?.uri || "self";
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

    const createdShout = await ctx.client.db.shouts.create({
      content: shout.message,
      uri,
      author_id: user.xata_id,
      album_id: album?.xata_id,
      artist_id: artist?.xata_id,
      track_id: track?.xata_id,
      scrobble_id: scrobble?.xata_id,
    });

    if (profile) {
      await ctx.client.db.profile_shouts.create({
        shout_id: createdShout.xata_id,
        user_id: profile.xata_id,
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
  agent: Agent
) {
  const shout = await ctx.client.db.shouts
    .select(["track_id.*", "album_id.*", "artist_id.*", "scrobble_id.*", "uri"])
    .filter("uri", shoutUri)
    .getFirst();
  if (!shout) {
    throw new Error("Shout not found");
  }

  const { data: profileRecord } = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: "app.bsky.actor.profile",
    rkey: "self",
  });

  let collection = "app.bsky.actor.profile";

  if (shout.track_id) {
    collection = "app.rocksky.song";
  }

  if (shout.album_id) {
    collection = "app.rocksky.album";
  }

  if (shout.artist_id) {
    collection = "app.rocksky.artist";
  }

  if (shout.scrobble_id) {
    collection = "app.rocksky.scrobble";
  }

  const subjectUri =
    shout.track_id?.uri ||
    shout.album_id?.uri ||
    shout.artist_id?.uri ||
    shout.scrobble_id?.uri ||
    profileRecord.uri;

  const subjectRecord = await agent.com.atproto.repo.getRecord({
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

  const parentRecord = await agent.com.atproto.repo.getRecord({
    repo: shoutUri.split("/").slice(0, 3).join("/").split("at://")[1],
    collection: "app.rocksky.shout",
    rkey: shoutUri.split("/").pop(),
  });

  const parentRef = validateMain({
    uri: shout.uri,
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

    const createdShout = await ctx.client.db.shouts.create({
      content: reply.message,
      uri,
      parent_id: shout.xata_id,
      author_id: user.xata_id,
      track_id: shout.track_id?.xata_id,
      album_id: shout.album_id?.xata_id,
      artist_id: shout.artist_id?.xata_id,
      scrobble_id: shout.scrobble_id?.xata_id,
    });

    if (
      !shout.track_id &&
      !shout.album_id &&
      !shout.artist_id &&
      !shout.scrobble_id
    ) {
      await ctx.client.db.profile_shouts.create({
        shout_id: createdShout.xata_id,
        user_id: user.xata_id,
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
  agent: Agent
) {
  const rkey = TID.nextStr();
  const likes = await ctx.client.db.shout_likes
    .filter({
      "shout_id.uri": shoutUri,
      "user_id.xata_id": user.xata_id,
    })
    .getFirst();

  if (likes) {
    return;
  }

  const subjectRecord = await agent.com.atproto.repo.getRecord({
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
    const shout = await ctx.client.db.shouts
      .select(["xata_id", "uri"])
      .filter("uri", shoutUri)
      .getFirst();
    if (!shout) {
      throw new Error("Shout not found");
    }

    await ctx.client.db.shout_likes.create({
      shout_id: shout.xata_id,
      user_id: user.xata_id,
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
  agent: Agent
) {
  const likes = await ctx.client.db.shout_likes
    .filter({
      "shout_id.uri": shoutUri,
      "user_id.xata_id": user.xata_id,
    })
    .getFirst();

  if (!likes) {
    return;
  }

  const rkey = likes.uri.split("/").pop();

  await Promise.all([
    agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.like",
      rkey,
    }),
    ctx.client.db.shout_likes.delete(likes.xata_id),
  ]);
}
