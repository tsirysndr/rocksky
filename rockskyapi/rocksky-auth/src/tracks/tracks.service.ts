import { Agent } from "@atproto/api";
import { equals } from "@xata.io/client";
import { Context } from "context";
import { createHash } from "crypto";
import {
  putAlbumRecord,
  putArtistRecord,
  putSongRecord,
} from "nowplaying/nowplaying.service";
import { Track } from "types/track";

export async function saveTrack(ctx: Context, track: Track, agent: Agent) {
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

  let trackUri = existingTrack?.uri;
  if (!existingTrack?.uri) {
    trackUri = await putSongRecord(track, agent);
  }

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
      copyright_message: track.copyrightMessage
        ? track.copyrightMessage
        : undefined,
      uri: trackUri ? trackUri : undefined,
      label: track.label ? track.label : undefined,
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

  let artistUri = existingArtist?.uri;
  if (!existingArtist?.uri) {
    artistUri = await putArtistRecord(track, agent);
  }

  const { xata_id: artist_id, uri: new_artist_uri } =
    await ctx.client.db.artists.createOrUpdate(existingArtist?.xata_id, {
      name: track.albumArtist,
      // compute sha256 (lowercase(name))
      sha256: createHash("sha256")
        .update(track.albumArtist.toLowerCase())
        .digest("hex"),
      uri: artistUri ? artistUri : undefined,
      picture: track.artistPicture ? track.artistPicture : undefined,
    });

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

  let albumUri = existingAlbum?.uri;
  if (!existingAlbum?.uri) {
    albumUri = await putAlbumRecord(track, agent);
  }

  const { xata_id: album_id, uri: new_album_uri } =
    await ctx.client.db.albums.createOrUpdate(existingAlbum?.xata_id, {
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
      artist_uri: new_artist_uri,
      uri: albumUri ? albumUri : undefined,
    });

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
}
