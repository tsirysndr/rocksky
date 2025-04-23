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

  // start update existing track with album and artist uri
  if (existingTrack && !existingTrack.album_uri) {
    const album = await ctx.client.db.albums
      .filter(
        "sha256",
        equals(
          createHash("sha256")
            .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
            .digest("hex")
        )
      )
      .getFirst();
    if (album) {
      await ctx.client.db.tracks.update(existingTrack.xata_id, {
        album_uri: album.uri,
      });
    }
  }

  if (existingTrack && !existingTrack.artist_uri) {
    const artist = await ctx.client.db.artists
      .filter(
        "sha256",
        equals(
          createHash("sha256")
            .update(track.albumArtist.toLowerCase())
            .digest("hex")
        )
      )
      .getFirst();
    if (artist) {
      await ctx.client.db.tracks.update(existingTrack.xata_id, {
        artist_uri: artist.uri,
      });
    }
  }
  // end

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

  let tries = 0;

  while (tries < 15) {
    const track_id = await ctx.client.db.tracks
      .filter("uri", equals(trackUri))
      .getFirst();

    const album_id = await ctx.client.db.albums
      .filter("uri", equals(albumUri))
      .getFirst();

    const artist_id = await ctx.client.db.artists
      .filter("uri", equals(artistUri))
      .getFirst();

    if (!track_id || !album_id || !artist_id) {
      console.log(
        "Track not yet saved (uri not saved), retrying...",
        tries + 1
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      tries += 1;
      continue;
    }

    const album_track = await ctx.client.db.album_tracks
      .filter("album_id", equals(album_id.xata_id))
      .filter("track_id", equals(track_id.xata_id))
      .getFirst();

    const artist_track = await ctx.client.db.artist_tracks
      .filter("artist_id", equals(artist_id.xata_id))
      .filter("track_id", equals(track_id.xata_id))
      .getFirst();

    const artist_album = await ctx.client.db.artist_albums
      .filter("artist_id", equals(artist_id.xata_id))
      .filter("album_id", equals(album_id.xata_id))
      .getFirst();

    if (
      album_track &&
      artist_track &&
      artist_album &&
      track_id &&
      track_id.album_uri &&
      track_id.artist_uri
    ) {
      console.log("Track saved successfully after", tries + 1, "tries");

      const message = JSON.stringify({
        track: track_id,
        album_track,
        artist_track,
        artist_album,
      });

      ctx.nc.publish("rocksky.track", Buffer.from(message));
      break;
    }

    tries += 1;
    console.log("Track not yet saved, retrying...", tries + 1);
    if (tries == 15) {
      console.log(">>>");
      console.log(album_track);
      console.log(artist_track);
      console.log(artist_album);
      console.log(track_id);
      console.log(track_id.album_uri);
      console.log(track_id.artist_uri);
      console.log("<<<");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (tries == 15) {
    console.log("Failed to save track after 15 tries");
  }
}
