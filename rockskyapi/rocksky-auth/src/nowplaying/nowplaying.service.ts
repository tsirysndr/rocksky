import { Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import { equals, SelectedPick } from "@xata.io/client";
import { Context } from "context";
import { createHash } from "crypto";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import * as Song from "lexicon/types/app/rocksky/song";
import downloadImage from "lib/downloadImage";
import { Track } from "types/track";
import { ScrobblesRecord } from "xata";

async function putArtistRecord(
  track: Track,
  agent: Agent
): Promise<string | null> {
  const rkey = TID.nextStr();
  const record = {
    $type: "app.rocksky.artist",
    name: track.albumArtist,
    createdAt: new Date().toISOString(),
  };

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

async function putAlbumRecord(
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

async function putSongRecord(
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
    releaseDate: track.releaseDate
      ? track.releaseDate.toISOString()
      : undefined,
    year: track.year,
    composer: !!track.composer ? track.composer : undefined,
    lyrics: !!track.lyrics ? track.lyrics : undefined,
    copyrightMessage: !!track.copyrightMessage
      ? track.copyrightMessage
      : undefined,
    createdAt: new Date().toISOString(),
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

export async function updateUserLibrary(
  ctx: Context,
  user,
  track_id: string,
  album_id: string,
  artist_id: string,
  trackUri: string,
  albumUri: string,
  artistUri: string
): Promise<void> {
  const existingUserTrack = await ctx.client.db.user_tracks
    .filter("user_id", equals(user.xata_id))
    .filter("track_id", equals(track_id))
    .getFirst();
  if (!existingUserTrack) {
    await ctx.client.db.user_tracks.create({
      user_id: user.xata_id,
      track_id,
      uri: trackUri,
      scrobbles: 1,
    });
  } else {
    await ctx.client.db.user_tracks.update({
      xata_id: existingUserTrack.xata_id,
      scrobbles: existingUserTrack.scrobbles
        ? existingUserTrack.scrobbles + 1
        : 1,
    });
  }

  const existingUserArtist = await ctx.client.db.user_artists
    .filter("user_id", equals(user.xata_id))
    .filter("artist_id", equals(artist_id))
    .getFirst();
  if (!existingUserArtist) {
    await ctx.client.db.user_artists.create({
      user_id: user.xata_id,
      artist_id,
      uri: artistUri,
      scrobbles: 1,
    });
  } else {
    await ctx.client.db.user_artists.update({
      xata_id: existingUserArtist.xata_id,
      scrobbles: existingUserArtist.scrobbles
        ? existingUserArtist.scrobbles + 1
        : 1,
    });
  }

  const existingUserAlbum = await ctx.client.db.user_albums
    .filter("user_id", equals(user.xata_id))
    .filter("album_id", equals(album_id))
    .getFirst();
  if (!existingUserAlbum) {
    await ctx.client.db.user_albums.create({
      user_id: user.xata_id,
      album_id,
      uri: albumUri,
      scrobbles: 1,
    });
  } else {
    await ctx.client.db.user_albums.update({
      xata_id: existingUserAlbum.xata_id,
      scrobbles: existingUserAlbum.scrobbles
        ? existingUserAlbum.scrobbles + 1
        : 1,
    });
  }
}

export async function scrobbleTrack(
  ctx: Context,
  track: Track,
  user,
  agent: Agent
): Promise<Readonly<SelectedPick<ScrobblesRecord, ["*"]>>> {
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
      copyright_message: track.copyrightMessage,
      uri: trackUri ? trackUri : undefined,
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
      uri: albumUri ? albumUri : undefined,
      artist_uri: new_artist_uri,
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

  const scrobbleUri = await putScrobbleRecord(track, agent);

  await updateUserLibrary(
    ctx,
    user,
    track_id,
    album_id,
    artist_id,
    trackUri,
    albumUri,
    artistUri
  );

  await ctx.client.db.tracks.update({
    xata_id: track_id,
    artist_uri: new_artist_uri,
    album_uri: new_album_uri,
  });

  const scrobble = await ctx.client.db.scrobbles.create({
    user_id: user.xata_id,
    track_id,
    album_id,
    artist_id,
    uri: scrobbleUri,
  });

  return scrobble;
}
