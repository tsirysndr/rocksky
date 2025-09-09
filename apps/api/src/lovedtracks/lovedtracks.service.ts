import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import { equals } from "@xata.io/client";
import type { Context } from "context";
import { createHash } from "crypto";
import * as LikeLexicon from "lexicon/types/app/rocksky/like";
import { validateMain } from "lexicon/types/com/atproto/repo/strongRef";
import type { Track } from "types/track";

export async function likeTrack(
  ctx: Context,
  track: Track,
  user,
  agent: Agent,
) {
  const existingTrack = await ctx.client.db.tracks
    .filter(
      "sha256",
      equals(
        createHash("sha256")
          .update(
            `${track.title} - ${track.artist} - ${track.album}`.toLowerCase(),
          )
          .digest("hex"),
      ),
    )
    .getFirst();

  const { xata_id: track_id } = await ctx.client.db.tracks.createOrUpdate(
    existingTrack?.xata_id,
    {
      title: track.title,
      artist: track.artist,
      album: track.album,
      album_art: track.albumArt,
      album_artist: track.albumArtist,
      track_number: track.trackNumber,
      duration: track.duration,
      mb_id: track.mbId,
      composer: track.composer,
      lyrics: track.lyrics,
      disc_number: track.discNumber,
      // compute sha256 (lowercase(title + artist + album))
      sha256: createHash("sha256")
        .update(
          `${track.title} - ${track.artist} - ${track.album}`.toLowerCase(),
        )
        .digest("hex"),
    },
  );

  const existingArtist = await ctx.client.db.artists
    .filter(
      "sha256",
      equals(
        createHash("sha256")
          .update(track.albumArtist.toLocaleLowerCase())
          .digest("hex"),
      ),
    )
    .getFirst();
  const { xata_id: artist_id } = await ctx.client.db.artists.createOrUpdate(
    existingArtist?.xata_id,
    {
      name: track.albumArtist,
      // compute sha256 (lowercase(name))
      sha256: createHash("sha256")
        .update(track.albumArtist.toLowerCase())
        .digest("hex"),
    },
  );

  const existingAlbum = await ctx.client.db.albums
    .filter(
      "sha256",
      equals(
        createHash("sha256")
          .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
          .digest("hex"),
      ),
    )
    .getFirst();

  const { xata_id: album_id } = await ctx.client.db.albums.createOrUpdate(
    existingAlbum?.xata_id,
    {
      title: track.album,
      artist: track.albumArtist,
      album_art: track.albumArt,
      year: track.year,
      release_date: track.releaseDate
        ? track.releaseDate.toISOString()
        : undefined,
      // compute sha256 (lowercase(title + artist))
      sha256: createHash("sha256")
        .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
        .digest("hex"),
    },
  );

  const existingAlbumTrack = await ctx.client.db.album_tracks
    .filter("album_id", equals(album_id))
    .filter("track_id", equals(track_id))
    .getFirst();

  await ctx.client.db.album_tracks.createOrUpdate(existingAlbumTrack?.xata_id, {
    album_id,
    track_id,
  });

  const existingArtistTrack = await ctx.client.db.artist_tracks
    .filter("artist_id", equals(artist_id))
    .filter("track_id", equals(track_id))
    .getFirst();

  await ctx.client.db.artist_tracks.createOrUpdate(
    existingArtistTrack?.xata_id,
    {
      artist_id,
      track_id,
    },
  );

  const existingArtistAlbum = await ctx.client.db.artist_albums
    .filter("artist_id", equals(artist_id))
    .filter("album_id", equals(album_id))
    .getFirst();

  await ctx.client.db.artist_albums.createOrUpdate(
    existingArtistAlbum?.xata_id,
    {
      artist_id,
      album_id,
    },
  );

  const lovedTrack = await ctx.client.db.loved_tracks
    .filter("user_id", equals(user.xata_id))
    .filter("track_id", equals(track_id))
    .getFirst();

  let created = await ctx.client.db.loved_tracks.createOrUpdate(
    lovedTrack?.xata_id,
    {
      user_id: user.xata_id,
      track_id,
    },
  );

  if (existingTrack.uri) {
    const rkey = TID.nextStr();
    const subjectRecord = await agent.com.atproto.repo.getRecord({
      repo: existingTrack.uri
        .split("/")
        .slice(0, 3)
        .join("/")
        .split("at://")[1],
      collection: "app.rocksky.song",
      rkey: existingTrack.uri.split("/").pop(),
    });

    const subjectRef = validateMain({
      uri: existingTrack.uri,
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
      created = await ctx.client.db.loved_tracks.update(created.xata_id, {
        uri,
      });
    } catch (e) {
      console.error(`Error creating like record: ${e.message}`);
    }
  }

  const message = JSON.stringify(created);
  ctx.nc.publish("rocksky.like", Buffer.from(message));

  return created;
}

export async function unLikeTrack(
  ctx: Context,
  trackSha256: string,
  user,
  agent: Agent,
) {
  const track = await ctx.client.db.tracks
    .filter("sha256", equals(trackSha256))
    .getFirst();

  if (!track) {
    return;
  }

  const lovedTrack = await ctx.client.db.loved_tracks
    .filter("user_id", equals(user.xata_id))
    .filter("track_id", equals(track.xata_id))
    .getFirst();

  if (!lovedTrack) {
    return;
  }

  const rkey = lovedTrack.uri.split("/").pop();

  await Promise.all([
    agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.like",
      rkey,
    }),
    ctx.client.db.loved_tracks.delete(lovedTrack.xata_id),
  ]);

  const message = JSON.stringify(lovedTrack);
  ctx.nc.publish("rocksky.unlike", Buffer.from(message));
}

export async function getLovedTracks(
  ctx: Context,
  user,
  size = 10,
  offset = 0,
) {
  const lovedTracks = await ctx.client.db.loved_tracks
    .select(["track_id.*"])
    .filter("user_id", equals(user.xata_id))
    .sort("xata_createdat", "desc")
    .getPaginated({
      pagination: {
        size,
        offset,
      },
    });

  return lovedTracks.records;
}
