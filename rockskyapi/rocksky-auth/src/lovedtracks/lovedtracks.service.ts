import { equals } from "@xata.io/client";
import { Context } from "context";
import { createHash } from "crypto";
import { Track } from "types/track";

export async function likeTrack(ctx: Context, track: Track, user) {
  const existingTrack = await ctx.client.db.tracks
    .filter(
      "sha256",
      equals(
        createHash("sha256")
          .update(
            `${track.title} - ${track.artist} - ${track.album}`.toLowerCase()
          )
          .digest("hex")
      )
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
          `${track.title} - ${track.artist} - ${track.album}`.toLowerCase()
        )
        .digest("hex"),
    }
  );

  const existingArtist = await ctx.client.db.artists
    .filter(
      "sha256",
      equals(
        createHash("sha256")
          .update(track.albumArtist.toLocaleLowerCase())
          .digest("hex")
      )
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
    }
  );

  const existingAlbum = await ctx.client.db.albums
    .filter(
      "sha256",
      equals(
        createHash("sha256")
          .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
          .digest("hex")
      )
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
    }
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
    }
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
    }
  );

  const lovedTrack = await ctx.client.db.loved_tracks
    .filter("user_id", equals(user.xata_id))
    .filter("track_id", equals(track_id))
    .getFirst();

  const created = await ctx.client.db.loved_tracks.createOrUpdate(
    lovedTrack?.xata_id,
    {
      user_id: user.xata_id,
      track_id,
    }
  );
  return created;
}

export async function unLikeTrack(ctx: Context, trackSha256: string, user) {
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

  await ctx.client.db.loved_tracks.delete(lovedTrack.xata_id);
}

export async function getLovedTracks(
  ctx: Context,
  user,
  size = 10,
  offset = 0
) {
  const lovedTracks = await ctx.client.db.loved_tracks
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
