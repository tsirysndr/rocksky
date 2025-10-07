import type { Agent } from "@atproto/api";
import type { Context } from "context";
import { and, eq } from "drizzle-orm";
import { deepSnakeCaseKeys } from "lib";
import { createHash } from "node:crypto";
import {
  putAlbumRecord,
  putArtistRecord,
  putSongRecord,
} from "nowplaying/nowplaying.service";
import tables from "schema";
import type { Track } from "types/track";

const { tracks, albums, artists, albumTracks, artistTracks, artistAlbums } =
  tables;

export async function saveTrack(ctx: Context, track: Track, agent: Agent) {
  const trackHash = createHash("sha256")
    .update(`${track.title} - ${track.artist} - ${track.album}`.toLowerCase())
    .digest("hex");

  const existingTrack = await ctx.db
    .select()
    .from(tracks)
    .where(eq(tracks.sha256, trackHash))
    .limit(1)
    .then((results) => results[0]);

  let trackUri = existingTrack?.uri;
  if (!existingTrack?.uri) {
    trackUri = await putSongRecord(track, agent);
  }

  // start update existing track with album and artist uri
  if (existingTrack && !existingTrack.albumUri) {
    const albumHash = createHash("sha256")
      .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
      .digest("hex");

    const album = await ctx.db
      .select()
      .from(albums)
      .where(eq(albums.sha256, albumHash))
      .limit(1)
      .then((results) => results[0]);

    if (album) {
      await ctx.db
        .update(tracks)
        .set({ albumUri: album.uri })
        .where(eq(tracks.id, existingTrack.id));
    }
  }

  if (existingTrack && !existingTrack.artistUri) {
    const artistHash = createHash("sha256")
      .update(track.albumArtist.toLowerCase())
      .digest("hex");

    const artist = await ctx.db
      .select()
      .from(artists)
      .where(eq(artists.sha256, artistHash))
      .limit(1)
      .then((results) => results[0]);

    if (artist) {
      await ctx.db
        .update(tracks)
        .set({ artistUri: artist.uri })
        .where(eq(tracks.id, existingTrack.id));
    }
  }
  // end

  const artistHash = createHash("sha256")
    .update(track.albumArtist.toLowerCase())
    .digest("hex");

  const existingArtist = await ctx.db
    .select()
    .from(artists)
    .where(eq(artists.sha256, artistHash))
    .limit(1)
    .then((results) => results[0]);

  let artistUri = existingArtist?.uri;
  if (!existingArtist?.uri) {
    artistUri = await putArtistRecord(track, agent);
  }

  const albumHash = createHash("sha256")
    .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
    .digest("hex");

  const existingAlbum = await ctx.db
    .select()
    .from(albums)
    .where(eq(albums.sha256, albumHash))
    .limit(1)
    .then((results) => results[0]);

  let albumUri = existingAlbum?.uri;
  if (!existingAlbum?.uri) {
    albumUri = await putAlbumRecord(track, agent);
  }

  let tries = 0;

  while (tries < 15) {
    const track_id = await ctx.db
      .select()
      .from(tracks)
      .where(eq(tracks.uri, trackUri))
      .limit(1)
      .then((results) => results[0]);

    const album_id = await ctx.db
      .select()
      .from(albums)
      .where(eq(albums.uri, albumUri))
      .limit(1)
      .then((results) => results[0]);

    const artist_id = await ctx.db
      .select()
      .from(artists)
      .where(eq(artists.uri, artistUri))
      .limit(1)
      .then((results) => results[0]);

    if (!track_id || !album_id || !artist_id) {
      console.log(
        "Track not yet saved (uri not saved), retrying...",
        tries + 1
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      tries += 1;
      continue;
    }

    const album_track = await ctx.db
      .select()
      .from(albumTracks)
      .where(
        and(
          eq(albumTracks.albumId, album_id.id),
          eq(albumTracks.trackId, track_id.id)
        )
      )
      .limit(1)
      .then((results) => results[0]);

    const artist_track = await ctx.db
      .select()
      .from(artistTracks)
      .where(
        and(
          eq(artistTracks.artistId, artist_id.id),
          eq(artistTracks.trackId, track_id.id)
        )
      )
      .limit(1)
      .then((results) => results[0]);

    const artist_album = await ctx.db
      .select()
      .from(artistAlbums)
      .where(
        and(
          eq(artistAlbums.artistId, artist_id.id),
          eq(artistAlbums.albumId, album_id.id)
        )
      )
      .limit(1)
      .then((results) => results[0]);

    if (!album_track) {
      await ctx.db.insert(albumTracks).values({
        albumId: album_id.id,
        trackId: track_id.id,
      });
    }

    if (!artist_track) {
      await ctx.db.insert(artistTracks).values({
        artistId: artist_id.id,
        trackId: track_id.id,
      });
    }

    if (!artist_album) {
      await ctx.db.insert(artistAlbums).values({
        artistId: artist_id.id,
        albumId: album_id.id,
      });
    }

    if (track_id && !track_id.albumUri) {
      await ctx.db
        .update(tracks)
        .set({ albumUri: album_id.uri })
        .where(eq(tracks.id, track_id.id));
    }

    if (track_id && !track_id.artistUri) {
      await ctx.db
        .update(tracks)
        .set({ artistUri: artist_id.uri })
        .where(eq(tracks.id, track_id.id));
    }

    if (
      album_track &&
      artist_track &&
      artist_album &&
      track_id &&
      track_id.albumUri &&
      track_id.artistUri
    ) {
      console.log("Track saved successfully after", tries + 1, "tries");

      const message = JSON.stringify(
        deepSnakeCaseKeys({
          track: {
            ...track_id,
            xata_id: track_id.id,
            xata_createdat: track_id.createdAt.toISOString(),
            xata_updatedat: track_id.updatedAt.toISOString(),
          },
          album_track: {
            ...album_track,
            album_id: {
              xata_id: album_track.albumId,
            },
            track_id: {
              xata_id: album_track.trackId,
            },
            xata_id: album_track.id,
            xata_createdat: album_track.createdAt.toISOString(),
            xata_updatedat: album_track.updatedAt.toISOString(),
          },
          artist_track: {
            ...artist_track,
            artist_id: {
              xata_id: artist_track.artistId,
            },
            track_id: {
              xata_id: artist_track.trackId,
            },
            xata_id: artist_track.id,
            xata_createdat: artist_track.createdAt.toISOString(),
            xata_updatedat: artist_track.updatedAt.toISOString(),
          },
          artist_album: {
            ...artist_album,
            artist_id: {
              xata_id: artist_album.artistId,
            },
            album_id: {
              xata_id: artist_album.albumId,
            },
            xata_id: artist_album.id,
            xata_createdat: artist_album.createdAt.toISOString(),
            xata_updatedat: artist_album.updatedAt.toISOString(),
          },
        })
      );

      ctx.nc.publish(
        "rocksky.track",
        Buffer.from(message.replaceAll("sha_256", "sha256"))
      );
      break;
    }

    tries += 1;
    console.log("Track not yet saved, retrying...", tries + 1);
    if (tries === 15) {
      console.log(">>>");
      console.log(album_track);
      console.log(artist_track);
      console.log(artist_album);
      console.log(artist_id);
      console.log(album_id);
      console.log(track_id);
      console.log(track_id.albumUri);
      console.log(track_id.artistUri);
      console.log("<<<");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (tries === 15) {
    console.log("Failed to save track after 15 tries");
  }
}
