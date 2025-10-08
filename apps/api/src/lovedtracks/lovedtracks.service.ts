import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import type { Context } from "context";
import { and, desc, eq, type SQLWrapper } from "drizzle-orm";
import * as LikeLexicon from "lexicon/types/app/rocksky/like";
import { validateMain } from "lexicon/types/com/atproto/repo/strongRef";
import { createHash } from "node:crypto";
import type { Track } from "types/track";
import albumTracks from "../schema/album-tracks";
import albums from "../schema/albums";
import artistAlbums from "../schema/artist-albums";
import artistTracks from "../schema/artist-tracks";
import artists from "../schema/artists";
import lovedTracks from "../schema/loved-tracks";
import tracks from "../schema/tracks";

export async function likeTrack(
  ctx: Context,
  track: Track,
  user,
  agent: Agent,
) {
  const trackSha256 = createHash("sha256")
    .update(`${track.title} - ${track.artist} - ${track.album}`.toLowerCase())
    .digest("hex");

  const existingTrack = await ctx.db
    .select()
    .from(tracks)
    .where(eq(tracks.sha256, trackSha256))
    .limit(1)
    .then((rows) => rows[0]);

  let trackId: string;
  if (existingTrack) {
    const [updatedTrack] = await ctx.db
      .update(tracks)
      .set({
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArt: track.albumArt,
        albumArtist: track.albumArtist,
        trackNumber: track.trackNumber,
        duration: track.duration,
        mbId: track.mbId,
        composer: track.composer,
        lyrics: track.lyrics,
        discNumber: track.discNumber,
        sha256: trackSha256,
      })
      .where(eq(tracks.id, existingTrack.id))
      .returning();
    trackId = updatedTrack.id;
  } else {
    const [createdTrack] = await ctx.db
      .insert(tracks)
      .values({
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArt: track.albumArt,
        albumArtist: track.albumArtist,
        trackNumber: track.trackNumber,
        duration: track.duration,
        mbId: track.mbId,
        composer: track.composer,
        lyrics: track.lyrics,
        discNumber: track.discNumber,
        sha256: trackSha256,
      })
      .returning();
    trackId = createdTrack.id;
  }

  const artistSha256 = createHash("sha256")
    .update(track.albumArtist.toLowerCase())
    .digest("hex");

  const existingArtist = await ctx.db
    .select()
    .from(artists)
    .where(eq(artists.sha256, artistSha256))
    .limit(1)
    .then((rows) => rows[0]);

  let artistId: string;
  if (existingArtist) {
    const [updatedArtist] = await ctx.db
      .update(artists)
      .set({
        name: track.albumArtist,
        sha256: artistSha256,
      })
      .where(eq(artists.id, existingArtist.id))
      .returning();
    artistId = updatedArtist.id;
  } else {
    const [createdArtist] = await ctx.db
      .insert(artists)
      .values({
        name: track.albumArtist,
        sha256: artistSha256,
      })
      .returning();
    artistId = createdArtist.id;
  }

  const albumSha256 = createHash("sha256")
    .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
    .digest("hex");

  const existingAlbum = await ctx.db
    .select()
    .from(albums)
    .where(eq(albums.sha256, albumSha256))
    .limit(1)
    .then((rows) => rows[0]);

  let albumId: string;
  if (existingAlbum) {
    const [updatedAlbum] = await ctx.db
      .update(albums)
      .set({
        title: track.album,
        artist: track.albumArtist,
        albumArt: track.albumArt,
        year: track.year,
        releaseDate: track.releaseDate
          ? track.releaseDate.toISOString()
          : undefined,
        sha256: albumSha256,
      })
      .where(eq(albums.id, existingAlbum.id))
      .returning();
    albumId = updatedAlbum.id;
  } else {
    const [createdAlbum] = await ctx.db
      .insert(albums)
      .values({
        title: track.album,
        artist: track.albumArtist,
        albumArt: track.albumArt,
        year: track.year,
        releaseDate: track.releaseDate
          ? track.releaseDate.toISOString()
          : undefined,
        sha256: albumSha256,
      })
      .returning();
    albumId = createdAlbum.id;
  }

  // Create or update album_tracks relationship
  const existingAlbumTrack = await ctx.db
    .select()
    .from(albumTracks)
    .where(
      and(eq(albumTracks.albumId, albumId), eq(albumTracks.trackId, trackId)),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!existingAlbumTrack) {
    await ctx.db.insert(albumTracks).values({
      albumId,
      trackId,
    });
  }

  // Create or update artist_tracks relationship
  const existingArtistTrack = await ctx.db
    .select()
    .from(artistTracks)
    .where(
      and(
        eq(artistTracks.artistId, artistId),
        eq(artistTracks.trackId, trackId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!existingArtistTrack) {
    await ctx.db.insert(artistTracks).values({
      artistId,
      trackId,
    });
  }

  // Create or update artist_albums relationship
  const existingArtistAlbum = await ctx.db
    .select()
    .from(artistAlbums)
    .where(
      and(
        eq(artistAlbums.artistId, artistId),
        eq(artistAlbums.albumId, albumId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!existingArtistAlbum) {
    await ctx.db.insert(artistAlbums).values({
      artistId,
      albumId,
    });
  }

  // Create or update loved track
  const existingLovedTrack = await ctx.db
    .select()
    .from(lovedTracks)
    .where(
      and(eq(lovedTracks.userId, user.id), eq(lovedTracks.trackId, trackId)),
    )
    .limit(1)
    .then((rows) => rows[0]);

  let created: { id: string | SQLWrapper };
  if (existingLovedTrack) {
    [created] = await ctx.db
      .update(lovedTracks)
      .set({
        userId: user.id,
        trackId,
      })
      .where(eq(lovedTracks.id, existingLovedTrack.id))
      .returning();
  } else {
    [created] = await ctx.db
      .insert(lovedTracks)
      .values({
        userId: user.id,
        trackId,
      })
      .returning();
  }

  // Get the track with uri for ATProto operations
  const trackWithUri = await ctx.db
    .select()
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1)
    .then((rows) => rows[0]);

  if (trackWithUri?.uri) {
    const rkey = TID.nextStr();
    const subjectRecord = await agent.com.atproto.repo.getRecord({
      repo: trackWithUri.uri.split("/").slice(0, 3).join("/").split("at://")[1],
      collection: "app.rocksky.song",
      rkey: trackWithUri.uri.split("/").pop(),
    });

    const subjectRef = validateMain({
      uri: trackWithUri.uri,
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

      [created] = await ctx.db
        .update(lovedTracks)
        .set({ uri })
        .where(eq(lovedTracks.id, created.id))
        .returning();
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
  const track = await ctx.db
    .select()
    .from(tracks)
    .where(eq(tracks.sha256, trackSha256))
    .limit(1)
    .then((rows) => rows[0]);

  if (!track) {
    return;
  }

  const lovedTrack = await ctx.db
    .select()
    .from(lovedTracks)
    .where(
      and(eq(lovedTracks.userId, user.id), eq(lovedTracks.trackId, track.id)),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!lovedTrack) {
    return;
  }

  const rkey = lovedTrack.uri?.split("/").pop();

  await Promise.all([
    rkey
      ? agent.com.atproto.repo.deleteRecord({
          repo: agent.assertDid,
          collection: "app.rocksky.like",
          rkey,
        })
      : Promise.resolve(),
    ctx.db.delete(lovedTracks).where(eq(lovedTracks.id, lovedTrack.id)),
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
  const lovedTracksData = await ctx.db
    .select({
      lovedTrack: lovedTracks,
      track: tracks,
    })
    .from(lovedTracks)
    .innerJoin(tracks, eq(lovedTracks.trackId, tracks.id))
    .where(eq(lovedTracks.userId, user.id))
    .orderBy(desc(lovedTracks.createdAt))
    .limit(size)
    .offset(offset);

  return lovedTracksData.map((item) => item.track);
}
