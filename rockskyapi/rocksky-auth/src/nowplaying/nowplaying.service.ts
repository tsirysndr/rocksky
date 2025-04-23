import { Agent, BlobRef } from "@atproto/api";
import { TID } from "@atproto/common";
import { equals } from "@xata.io/client";
import chalk from "chalk";
import { Context } from "context";
import { createHash } from "crypto";
import dayjs from "dayjs";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import * as Song from "lexicon/types/app/rocksky/song";
import downloadImage, { getContentType } from "lib/downloadImage";
import { Track } from "types/track";

export async function putArtistRecord(
  track: Track,
  agent: Agent
): Promise<string | null> {
  const rkey = TID.nextStr();
  const record: {
    $type: string;
    name: string;
    createdAt: string;
    picture?: BlobRef;
  } = {
    $type: "app.rocksky.artist",
    name: track.albumArtist,
    createdAt: new Date().toISOString(),
  };

  if (track.artistPicture) {
    const imageBuffer = await downloadImage(track.artistPicture);
    const encoding = await getContentType(track.artistPicture);
    const uploadResponse = await agent.uploadBlob(imageBuffer, {
      encoding,
    });
    record.picture = uploadResponse.data.blob;
  }

  if (!Artist.validateRecord(record).success) {
    console.log(Artist.validateRecord(record));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.artist",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    console.log(`Artist record created at ${uri}`);
    return uri;
  } catch (e) {
    console.error("Error creating artist record", e);
    return null;
  }
}

export async function putAlbumRecord(
  track: Track,
  agent: Agent
): Promise<string | null> {
  const rkey = TID.nextStr();
  let albumArt = undefined;

  if (track.albumArt) {
    let options = undefined;
    if (track.albumArt.endsWith(".jpeg") || track.albumArt.endsWith(".jpg")) {
      options = { encoding: "image/jpeg" };
    }

    if (track.albumArt.endsWith(".png")) {
      options = { encoding: "image/png" };
    }

    if (!options?.encoding) {
      options = { encoding: await getContentType(track.albumArt) };
    }

    const imageBuffer = await downloadImage(track.albumArt);
    const uploadResponse = await agent.uploadBlob(imageBuffer, options);
    albumArt = uploadResponse.data.blob;
  }

  const record = {
    $type: "app.rocksky.album",
    title: track.album,
    artist: track.albumArtist,
    year: track.year,
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    createdAt: new Date().toISOString(),
    albumArt,
  };

  if (!Album.validateRecord(record).success) {
    console.log(Album.validateRecord(record));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.album",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    console.log(`Album record created at ${uri}`);
    return uri;
  } catch (e) {
    console.error("Error creating album record", e);
    return null;
  }
}

export async function putSongRecord(
  track: Track,
  agent: Agent
): Promise<string | null> {
  const rkey = TID.nextStr();
  let albumArt = undefined;

  if (track.albumArt) {
    let options = undefined;
    if (track.albumArt.endsWith(".jpeg") || track.albumArt.endsWith(".jpg")) {
      options = { encoding: "image/jpeg" };
    }

    if (track.albumArt.endsWith(".png")) {
      options = { encoding: "image/png" };
    }

    const imageBuffer = await downloadImage(track.albumArt);
    const uploadResponse = await agent.uploadBlob(imageBuffer, options);
    albumArt = uploadResponse.data.blob;
  }

  const record = {
    $type: "app.rocksky.song",
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    year: track.year,
    albumArt,
    composer: !!track.composer ? track.composer : undefined,
    lyrics: !!track.lyrics ? track.lyrics : undefined,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber === 0 ? 1 : track.discNumber,
    copyrightMessage: !!track.copyrightMessage
      ? track.copyrightMessage
      : undefined,
    createdAt: new Date().toISOString(),
  };

  if (!Song.validateRecord(record).success) {
    console.log(Song.validateRecord(record));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.song",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    console.log(`Song record created at ${uri}`);
    return uri;
  } catch (e) {
    console.error("Error creating song record", e);
    return null;
  }
}

async function putScrobbleRecord(
  track: Track,
  agent: Agent
): Promise<string | null> {
  const rkey = TID.nextStr();
  let albumArt = undefined;

  if (track.albumArt) {
    let options = undefined;
    if (track.albumArt.endsWith(".jpeg") || track.albumArt.endsWith(".jpg")) {
      options = { encoding: "image/jpeg" };
    }

    if (track.albumArt.endsWith(".png")) {
      options = { encoding: "image/png" };
    }

    const imageBuffer = await downloadImage(track.albumArt);
    const uploadResponse = await agent.uploadBlob(imageBuffer, options);
    albumArt = uploadResponse.data.blob;
  }

  const record = {
    $type: "app.rocksky.scrobble",
    title: track.title,
    albumArtist: track.albumArtist,
    albumArt,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber === 0 ? 1 : track.discNumber,
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    year: track.year,
    composer: !!track.composer ? track.composer : undefined,
    lyrics: !!track.lyrics ? track.lyrics : undefined,
    copyrightMessage: !!track.copyrightMessage
      ? track.copyrightMessage
      : undefined,
    // if track.timestamp is not null, set it to the timestamp
    createdAt: track.timestamp
      ? dayjs.unix(track.timestamp).toISOString()
      : new Date().toISOString(),
  };

  if (!Scrobble.validateRecord(record).success) {
    console.log(Scrobble.validateRecord(record));
    throw new Error("Invalid record");
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.scrobble",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    console.log(`Scrobble record created at ${uri}`);
    return uri;
  } catch (e) {
    console.error("Error creating scrobble record", e);
    return null;
  }
}

export async function publishScrobble(ctx: Context, id: string) {
  const scrobble = await ctx.client.db.scrobbles
    .select(["*", "track_id.*", "album_id.*", "artist_id.*", "user_id.*"])
    .filter("xata_id", equals(id))
    .getFirst();

  const [
    user_album,
    user_artist,
    user_track,
    album_track,
    artist_track,
    artist_album,
  ] = await Promise.all([
    ctx.client.db.user_albums
      .select(["*"])
      .filter("album_id.xata_id", equals(scrobble.album_id.xata_id))
      .getFirst(),
    ctx.client.db.user_artists
      .select(["*"])
      .filter("artist_id.xata_id", equals(scrobble.artist_id.xata_id))
      .getFirst(),
    ctx.client.db.user_tracks
      .select(["*"])
      .filter("track_id.xata_id", equals(scrobble.track_id.xata_id))
      .getFirst(),
    ctx.client.db.album_tracks
      .select(["*"])
      .filter("track_id.xata_id", equals(scrobble.track_id.xata_id))
      .getFirst(),
    ctx.client.db.artist_tracks
      .select(["*"])
      .filter("track_id.xata_id", equals(scrobble.track_id.xata_id))
      .getFirst(),
    ctx.client.db.artist_albums
      .select(["*"])
      .filter("album_id.xata_id", equals(scrobble.album_id.xata_id))
      .filter("artist_id.xata_id", equals(scrobble.artist_id.xata_id))
      .getFirst(),
  ]);

  const message = JSON.stringify({
    scrobble,
    user_album,
    user_artist,
    user_track,
    album_track,
    artist_track,
    artist_album,
  });

  ctx.nc.publish("rocksky.scrobble", Buffer.from(message));
}

export async function scrobbleTrack(
  ctx: Context,
  track: Track,
  agent: Agent
): Promise<void> {
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

  if (!existingTrack?.uri) {
    await putSongRecord(track, agent);
  }

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

  if (!existingArtist?.uri) {
    await putArtistRecord(track, agent);
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

  if (!existingAlbum?.uri) {
    await putAlbumRecord(track, agent);
  }

  const scrobbleUri = await putScrobbleRecord(track, agent);

  // loop while scrobble is null, try 5 times, sleep 1 second between tries
  let tries = 0,
    scrobble = null;
  while (!scrobble && tries < 15) {
    scrobble = await ctx.client.db.scrobbles
      .select(["*", "track_id.*", "album_id.*", "artist_id.*", "user_id.*"])
      .filter("uri", equals(scrobbleUri))
      .getFirst();

    if (
      scrobble &&
      scrobble.track_id &&
      scrobble.album_id &&
      scrobble.artist_id
    ) {
      await publishScrobble(ctx, scrobble.xata_id);
      console.log("Scrobble published");
      break;
    }
    tries += 1;
    console.log("Scrobble not found, trying again: ", chalk.magenta(tries));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (tries === 15 && !scrobble) {
    console.log(`Scrobble not found after ${chalk.magenta("15 tries")}`);
  }
}
