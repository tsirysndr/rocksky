import {run} from "../../../output/Rocksky.Cli.Command.Sync/index.js";
import {fromAff} from "../../../output/Control.Promise/index.js";
import { JetStreamClient } from "../jetstream.js";
import { logger } from "../logger.js";
import { ctx } from "../context.js";
import { env } from "../lib/env.js";
import { createAgent } from "../lib/agent.js";
import { c } from "../theme.js";
import schema from "../schema/index.js";
import { createId } from "@paralleldrive/cuid2";
import _ from "lodash";
import { and, eq, or } from "drizzle-orm";
import { indexBy } from "ramda";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDidAndHandle } from "../lib/getDidAndHandle.js";
import { cleanUpJetstreamLockOnExit } from "../lib/cleanUpJetstreamLock.js";
import { cleanUpSyncLockOnExit } from "../lib/cleanUpSyncLock.js";
import { CarReader } from "@ipld/car";
import * as cbor from "@ipld/dag-cbor";
const sync=()=>fromAff(run)();
const getEndpoint = () => {
  const endpoint = env.JETSTREAM_SERVER;
  if (endpoint?.endsWith("/subscribe")) {
    return endpoint;
  }
  return `${endpoint}/subscribe`;
};
const createUser = async (agent, did, handle) => {
  const { data: profileRecord } = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: "app.bsky.actor.profile",
    rkey: "self"
  });
  const displayName = _.get(profileRecord, "value.displayName");
  const avatar = `https://cdn.bsky.app/img/avatar/plain/${did}/${_.get(profileRecord, "value.avatar.ref", "").toString()}@jpeg`;
  const [user] = await ctx.db.insert(schema.users).values({
    id: createId(),
    did,
    handle,
    displayName,
    avatar
  }).onConflictDoUpdate({
    target: schema.users.did,
    set: {
      handle,
      displayName,
      avatar,
      updatedAt: /* @__PURE__ */ new Date()
    }
  }).returning().execute();
  return user;
};
const createArtists = async (artists, user) => {
  if (artists.length === 0) return;
  const tags = artists.map((artist) => artist.value.tags || []);
  const uniqueTags = tags.flat().filter((tag) => tag).map((tag) => ({
    id: createId(),
    name: tag
  }));
  const BATCH_SIZE = 1e3;
  for (let i = 0; i < uniqueTags.length; i += BATCH_SIZE) {
    const batch = uniqueTags.slice(i, i + BATCH_SIZE);
    await ctx.db.insert(schema.genres).values(batch).onConflictDoNothing({
      target: schema.genres.name
    }).execute();
  }
  const genres = await ctx.db.select().from(schema.genres).execute();
  const genreMap = indexBy((genre) => genre.name, genres);
  let totalArtistsImported = 0;
  for (let i = 0; i < artists.length; i += BATCH_SIZE) {
    const batch = artists.slice(i, i + BATCH_SIZE);
    ctx.db.transaction((tx) => {
      const newArtists = tx.insert(schema.artists).values(
        batch.map((artist) => ({
          id: createId(),
          name: artist.value.name,
          cid: artist.cid,
          uri: artist.uri,
          biography: artist.value.bio,
          born: artist.value.born ? new Date(artist.value.born) : null,
          bornIn: artist.value.bornIn,
          died: artist.value.died ? new Date(artist.value.died) : null,
          picture: artist.value.pictureUrl,
          genres: artist.value.tags?.join(", ")
        }))
      ).onConflictDoNothing({
        target: schema.artists.cid
      }).returning().all();
      if (newArtists.length === 0) return;
      const artistGenres = newArtists.map(
        (artist) => artist.genres?.split(", ").filter((tag) => !!tag && !!genreMap[tag]).map((tag) => ({
          id: createId(),
          artistId: artist.id,
          genreId: genreMap[tag].id
        })) || []
      ).flat();
      if (artistGenres.length > 0) {
        tx.insert(schema.artistGenres).values(artistGenres).onConflictDoNothing({
          target: [schema.artistGenres.artistId, schema.artistGenres.genreId]
        }).returning().run();
      }
      tx.insert(schema.userArtists).values(
        newArtists.map((artist) => ({
          id: createId(),
          userId: user.id,
          artistId: artist.id,
          uri: artist.uri
        }))
      ).run();
      totalArtistsImported += newArtists.length;
    });
  }
  logger.info`👤 ${totalArtistsImported} Artists imported`;
};
const createAlbums = async (albums, user) => {
  if (albums.length === 0) return;
  const artists = await Promise.all(
    albums.map(
      async (album) => ctx.db.select().from(schema.artists).where(eq(schema.artists.name, album.value.artist)).execute().then(([artist]) => artist)
    )
  );
  const validAlbumData = albums.map((album, index) => ({ album, artist: artists[index] })).filter(({ artist }) => artist);
  const BATCH_SIZE = 1e3;
  let totalAlbumsImported = 0;
  for (let i = 0; i < validAlbumData.length; i += BATCH_SIZE) {
    const batch = validAlbumData.slice(i, i + BATCH_SIZE);
    ctx.db.transaction((tx) => {
      const newAlbums = tx.insert(schema.albums).values(
        batch.map(({ album, artist }) => ({
          id: createId(),
          cid: album.cid,
          uri: album.uri,
          title: album.value.title,
          artist: album.value.artist,
          releaseDate: album.value.releaseDate,
          year: album.value.year,
          albumArt: album.value.albumArtUrl,
          artistUri: artist.uri,
          appleMusicLink: album.value.appleMusicLink,
          spotifyLink: album.value.spotifyLink,
          tidalLink: album.value.tidalLink,
          youtubeLink: album.value.youtubeLink
        }))
      ).onConflictDoNothing({
        target: schema.albums.cid
      }).returning().all();
      if (newAlbums.length === 0) return;
      tx.insert(schema.userAlbums).values(
        newAlbums.map((album) => ({
          id: createId(),
          userId: user.id,
          albumId: album.id,
          uri: album.uri
        }))
      ).run();
      totalAlbumsImported += newAlbums.length;
    });
  }
  logger.info`💿 ${totalAlbumsImported} Albums imported`;
};
const createSongs = async (songs, user) => {
  if (songs.length === 0) return;
  const albums = await Promise.all(
    songs.map(
      (song) => ctx.db.select().from(schema.albums).where(
        and(
          eq(schema.albums.artist, song.value.albumArtist),
          eq(schema.albums.title, song.value.album)
        )
      ).execute().then((result) => result[0])
    )
  );
  const artists = await Promise.all(
    songs.map(
      (song) => ctx.db.select().from(schema.artists).where(eq(schema.artists.name, song.value.albumArtist)).execute().then((result) => result[0])
    )
  );
  const validSongData = songs.map((song, index) => ({
    song,
    artist: artists[index],
    album: albums[index]
  })).filter(({ artist, album }) => artist && album);
  const BATCH_SIZE = 1e3;
  let totalTracksImported = 0;
  for (let i = 0; i < validSongData.length; i += BATCH_SIZE) {
    const batch = validSongData.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(validSongData.length / BATCH_SIZE);
    logger.info`▶️ Processing tracks batch ${batchNumber}/${totalBatches} (${Math.min(i + BATCH_SIZE, validSongData.length)}/${validSongData.length})`;
    ctx.db.transaction((tx) => {
      const tracks = tx.insert(schema.tracks).values(
        batch.map(({ song, artist, album }) => ({
          id: createId(),
          cid: song.cid,
          uri: song.uri,
          title: song.value.title,
          artist: song.value.artist,
          albumArtist: song.value.albumArtist,
          albumArt: song.value.albumArtUrl,
          album: song.value.album,
          trackNumber: song.value.trackNumber,
          duration: song.value.duration,
          mbId: song.value.mbid,
          youtubeLink: song.value.youtubeLink,
          spotifyLink: song.value.spotifyLink,
          appleMusicLink: song.value.appleMusicLink,
          tidalLink: song.value.tidalLink,
          discNumber: song.value.discNumber,
          lyrics: song.value.lyrics,
          composer: song.value.composer,
          genre: song.value.genre,
          label: song.value.label,
          copyrightMessage: song.value.copyrightMessage,
          albumUri: album.uri,
          artistUri: artist.uri
        }))
      ).onConflictDoNothing().returning().all();
      if (tracks.length === 0) return;
      tx.insert(schema.albumTracks).values(
        tracks.map((track, index) => ({
          id: createId(),
          albumId: batch[index].album.id,
          trackId: track.id
        }))
      ).onConflictDoNothing({
        target: [schema.albumTracks.albumId, schema.albumTracks.trackId]
      }).run();
      tx.insert(schema.userTracks).values(
        tracks.map((track) => ({
          id: createId(),
          userId: user.id,
          trackId: track.id,
          uri: track.uri
        }))
      ).onConflictDoNothing({
        target: [schema.userTracks.userId, schema.userTracks.trackId]
      }).run();
      totalTracksImported += tracks.length;
    });
  }
  logger.info`▶️ ${totalTracksImported} Tracks imported`;
};
const createScrobbles = async (scrobbles, user) => {
  if (!scrobbles.length) return;
  logger.info`Loading Scrobble Tracks ...`;
  const tracks = await Promise.all(
    scrobbles.map(
      (scrobble) => ctx.db.select().from(schema.tracks).where(
        and(
          eq(schema.tracks.title, scrobble.value.title),
          eq(schema.tracks.artist, scrobble.value.artist),
          eq(schema.tracks.album, scrobble.value.album),
          eq(schema.tracks.albumArtist, scrobble.value.albumArtist)
        )
      ).execute().then(([track]) => track)
    )
  );
  logger.info`Loading Scrobble Albums ...`;
  const albums = await Promise.all(
    scrobbles.map(
      (scrobble) => ctx.db.select().from(schema.albums).where(
        and(
          eq(schema.albums.title, scrobble.value.album),
          eq(schema.albums.artist, scrobble.value.albumArtist)
        )
      ).execute().then(([album]) => album)
    )
  );
  logger.info`Loading Scrobble Artists ...`;
  const artists = await Promise.all(
    scrobbles.map(
      (scrobble) => ctx.db.select().from(schema.artists).where(
        or(
          and(eq(schema.artists.name, scrobble.value.artist)),
          and(eq(schema.artists.name, scrobble.value.albumArtist))
        )
      ).execute().then(([artist]) => artist)
    )
  );
  const validScrobbleData = scrobbles.map((scrobble, index) => ({
    scrobble,
    track: tracks[index],
    album: albums[index],
    artist: artists[index]
  })).filter(({ track, album, artist }) => track && album && artist);
  const BATCH_SIZE = 1e3;
  let totalScrobblesImported = 0;
  for (let i = 0; i < validScrobbleData.length; i += BATCH_SIZE) {
    const batch = validScrobbleData.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(validScrobbleData.length / BATCH_SIZE);
    logger.info`🕒 Processing scrobbles batch ${batchNumber}/${totalBatches} (${Math.min(i + BATCH_SIZE, validScrobbleData.length)}/${validScrobbleData.length})`;
    const result = await ctx.db.insert(schema.scrobbles).values(
      batch.map(({ scrobble, track, album, artist }) => ({
        id: createId(),
        userId: user.id,
        trackId: track.id,
        albumId: album.id,
        artistId: artist.id,
        uri: scrobble.uri,
        cid: scrobble.cid,
        timestamp: new Date(scrobble.value.createdAt)
      }))
    ).onConflictDoNothing({
      target: schema.scrobbles.cid
    }).returning().execute();
    totalScrobblesImported += result.length;
  }
  logger.info`🕒 ${totalScrobblesImported} scrobbles imported`;
};
const subscribeToJetstream = (user) => {
  const lockFile = path.join(os.tmpdir(), `rocksky-jetstream-${user.did}.lock`);
  if (fs.existsSync(lockFile)) {
    logger.warn`JetStream subscription already in progress for user ${user.did}`;
    logger.warn`Skipping subscription`;
    logger.warn`Lock file exists at ${lockFile}`;
    return Promise.resolve();
  }
  fs.writeFileSync(lockFile, "");
  const client = new JetStreamClient({
    wantedCollections: [
      "app.rocksky.scrobble",
      "app.rocksky.artist",
      "app.rocksky.album",
      "app.rocksky.song"
    ],
    endpoint: getEndpoint(),
    wantedDids: [user.did],
    // Reconnection settings
    maxReconnectAttempts: 10,
    reconnectDelay: 1e3,
    maxReconnectDelay: 3e4,
    backoffMultiplier: 1.5,
    // Enable debug logging
    debug: true
  });
  return new Promise((resolve, reject) => {
    client.on("open", () => {
      logger.info`✅ Connected to JetStream!`;
      cleanUpJetstreamLockOnExit(user.did);
      resolve();
    });
    client.on("message", async (data) => {
      const event = data;
      if (event.kind === "commit" && event.commit) {
        const { operation, collection, record, rkey, cid } = event.commit;
        const uri = `at://${event.did}/${collection}/${rkey}`;
        logger.info`\n📡 New event:`;
        logger.info`  Operation: ${operation}`;
        logger.info`  Collection: ${collection}`;
        logger.info`  DID: ${event.did}`;
        logger.info`  Uri: ${uri}`;
        if (operation === "create" && record) {
          console.log(JSON.stringify(record, null, 2));
          await onNewCollection(record, cid, uri, user);
        }
        logger.info`  Cursor: ${event.time_us}`;
      }
    });
    client.on("error", (error) => {
      logger.error`❌ Error:  ${error}`;
      cleanUpJetstreamLockOnExit(user.did);
      reject(error);
    });
    client.on("reconnect", (data) => {
      const { attempt } = data;
      logger.info`🔄 Reconnecting... (attempt ${attempt})`;
    });
    client.connect();
  });
};
const onNewCollection = async (record, cid, uri, user) => {
  switch (record.$type) {
    case "app.rocksky.song":
      await onNewSong(record, cid, uri, user);
      break;
    case "app.rocksky.album":
      await onNewAlbum(record, cid, uri, user);
      break;
    case "app.rocksky.artist":
      await onNewArtist(record, cid, uri, user);
      break;
    case "app.rocksky.scrobble":
      await onNewScrobble(record, cid, uri, user);
      break;
    default:
      logger.warn`Unknown collection type: ${record.$type}`;
  }
};
const onNewSong = async (record, cid, uri, user) => {
  const { title, artist, album } = record;
  logger.info`  New song: ${title} by ${artist} from ${album}`;
  await createSongs(
    [
      {
        cid,
        uri,
        value: record
      }
    ],
    user
  );
};
const onNewAlbum = async (record, cid, uri, user) => {
  const { title, artist } = record;
  logger.info`  New album: ${title} by ${artist}`;
  await createAlbums(
    [
      {
        cid,
        uri,
        value: record
      }
    ],
    user
  );
};
const onNewArtist = async (record, cid, uri, user) => {
  const { name } = record;
  logger.info`  New artist: ${name}`;
  await createArtists(
    [
      {
        cid,
        uri,
        value: record
      }
    ],
    user
  );
};
const onNewScrobble = async (record, cid, uri, user) => {
  const { title, createdAt, artist, album, albumArtist } = record;
  logger.info`  New scrobble: ${title} at ${createdAt}`;
  let [artistRecord] = await ctx.db.select().from(schema.artists).where(eq(schema.artists.name, record.albumArtist)).execute();
  if (!artistRecord) {
    logger.info`  ⚙️  Artist not found, creating: "${albumArtist}"`;
    const artistUri = `at://${user.did}/app.rocksky.artist/${createId()}`;
    const artistCid = createId();
    await createArtists(
      [
        {
          cid: artistCid,
          uri: artistUri,
          value: {
            $type: "app.rocksky.artist",
            name: record.albumArtist,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            tags: record.tags || []
          }
        }
      ],
      user
    );
    [artistRecord] = await ctx.db.select().from(schema.artists).where(eq(schema.artists.name, record.albumArtist)).execute();
    if (!artistRecord) {
      logger.error`  ❌ Failed to create artist. Skipping scrobble.`;
      return;
    }
  }
  let [albumRecord] = await ctx.db.select().from(schema.albums).where(
    and(
      eq(schema.albums.title, record.album),
      eq(schema.albums.artist, record.albumArtist)
    )
  ).execute();
  if (!albumRecord) {
    logger.info`  ⚙️  Album not found, creating: "${album}" by ${albumArtist}`;
    const albumUri = `at://${user.did}/app.rocksky.album/${createId()}`;
    const albumCid = createId();
    await createAlbums(
      [
        {
          cid: albumCid,
          uri: albumUri,
          value: {
            $type: "app.rocksky.album",
            title: record.album,
            artist: record.albumArtist,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            releaseDate: record.releaseDate,
            year: record.year,
            albumArt: record.albumArt,
            artistUri: artistRecord.uri,
            spotifyLink: record.spotifyLink,
            appleMusicLink: record.appleMusicLink,
            tidalLink: record.tidalLink,
            youtubeLink: record.youtubeLink
          }
        }
      ],
      user
    );
    [albumRecord] = await ctx.db.select().from(schema.albums).where(
      and(
        eq(schema.albums.title, record.album),
        eq(schema.albums.artist, record.albumArtist)
      )
    ).execute();
    if (!albumRecord) {
      logger.error`  ❌ Failed to create album. Skipping scrobble.`;
      return;
    }
  }
  let [track] = await ctx.db.select().from(schema.tracks).where(
    and(
      eq(schema.tracks.title, record.title),
      eq(schema.tracks.artist, record.artist),
      eq(schema.tracks.album, record.album),
      eq(schema.tracks.albumArtist, record.albumArtist)
    )
  ).execute();
  if (!track) {
    logger.info`  ⚙️  Track not found, creating: "${title}" by ${artist} from ${album}`;
    const trackUri = `at://${user.did}/app.rocksky.song/${createId()}`;
    const trackCid = createId();
    await createSongs(
      [
        {
          cid: trackCid,
          uri: trackUri,
          value: {
            $type: "app.rocksky.song",
            title: record.title,
            artist: record.artist,
            albumArtist: record.albumArtist,
            album: record.album,
            duration: record.duration,
            trackNumber: record.trackNumber,
            discNumber: record.discNumber,
            releaseDate: record.releaseDate,
            year: record.year,
            genre: record.genre,
            tags: record.tags,
            composer: record.composer,
            lyrics: record.lyrics,
            copyrightMessage: record.copyrightMessage,
            albumArt: record.albumArt,
            youtubeLink: record.youtubeLink,
            spotifyLink: record.spotifyLink,
            tidalLink: record.tidalLink,
            appleMusicLink: record.appleMusicLink,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            mbId: record.mbid,
            label: record.label,
            albumUri: albumRecord.uri,
            artistUri: artistRecord.uri
          }
        }
      ],
      user
    );
    [track] = await ctx.db.select().from(schema.tracks).where(
      and(
        eq(schema.tracks.title, record.title),
        eq(schema.tracks.artist, record.artist),
        eq(schema.tracks.album, record.album),
        eq(schema.tracks.albumArtist, record.albumArtist)
      )
    ).execute();
    if (!track) {
      logger.error`  ❌ Failed to create track. Skipping scrobble.`;
      return;
    }
  }
  logger.info`  ✓ All required entities ready. Creating scrobble...`;
  await createScrobbles(
    [
      {
        cid,
        uri,
        value: record
      }
    ],
    user
  );
};
const downloadCarFile = async (agent) => {
  logger.info(`Fetching repository CAR file ...`);
  const repoRes = await agent.com.atproto.sync.getRepo({
    did: agent.assertDid
  });
  return CarReader.fromBytes(new Uint8Array(repoRes.data));
};
const getRockskyUserSongs = async (agent, carReader) => {
  const results = [];
  try {
    const collection = "app.rocksky.song";
    logger.info`Extracting ${collection} records from CAR file ...`;
    for await (const { cid, bytes } of carReader.blocks()) {
      try {
        const decoded = cbor.decode(bytes);
        if (decoded && typeof decoded === "object" && "$type" in decoded) {
          if (decoded.$type === collection) {
            const value = decoded;
            const uri = `at://${agent.assertDid}/${collection}/${cid.toString()}`;
            results.push({
              value,
              uri,
              cid: cid.toString()
            });
          }
        }
      } catch (e) {
        logger.warn`  Skipping block with CID ${cid.toString()} due to decode error: ${e}`;
        continue;
      }
    }
    logger.info(
      `${c.secondary(agent.assertDid)} ${c.primary(results.length)} songs`
    );
  } catch (error) {
    logger.error(`Error fetching songs from CAR: ${error}`);
    throw error;
  }
  return results;
};
const getRockskyUserAlbums = async (agent, carReader) => {
  const results = [];
  try {
    const collection = "app.rocksky.album";
    logger.info`Extracting ${collection} records from CAR file ...`;
    for await (const { cid, bytes } of carReader.blocks()) {
      try {
        const decoded = cbor.decode(bytes);
        if (decoded && typeof decoded === "object" && "$type" in decoded) {
          if (decoded.$type === collection) {
            const value = decoded;
            const uri = `at://${agent.assertDid}/${collection}/${cid.toString()}`;
            results.push({
              value,
              uri,
              cid: cid.toString()
            });
          }
        }
      } catch (e) {
        logger.warn`  Skipping block with CID ${cid.toString()} due to decode error: ${e}`;
        continue;
      }
    }
    logger.info(
      `${c.secondary(agent.assertDid)} ${c.primary(results.length)} albums`
    );
  } catch (error) {
    logger.error(`Error fetching albums from CAR: ${error}`);
    throw error;
  }
  return results;
};
const getRockskyUserArtists = async (agent, carReader) => {
  const results = [];
  try {
    const collection = "app.rocksky.artist";
    logger.info`Extracting ${collection} records from CAR file ...`;
    for await (const { cid, bytes } of carReader.blocks()) {
      try {
        const decoded = cbor.decode(bytes);
        if (decoded && typeof decoded === "object" && "$type" in decoded) {
          if (decoded.$type === collection) {
            const value = decoded;
            const uri = `at://${agent.assertDid}/${collection}/${cid.toString()}`;
            results.push({
              value,
              uri,
              cid: cid.toString()
            });
          }
        }
      } catch (e) {
        continue;
      }
    }
    logger.info(
      `${c.secondary(agent.assertDid)} ${c.primary(results.length)} artists`
    );
  } catch (error) {
    logger.error(`Error fetching artists from CAR: ${error}`);
    throw error;
  }
  return results;
};
const getRockskyUserScrobbles = async (agent, carReader) => {
  const results = [];
  try {
    const collection = "app.rocksky.scrobble";
    logger.info`Extracting ${collection} records from CAR file ...`;
    for await (const { cid, bytes } of carReader.blocks()) {
      try {
        const decoded = cbor.decode(bytes);
        if (decoded && typeof decoded === "object" && "$type" in decoded) {
          if (decoded.$type === collection) {
            const value = decoded;
            const uri = `at://${agent.assertDid}/${collection}/${cid.toString()}`;
            results.push({
              value,
              uri,
              cid: cid.toString()
            });
          }
        }
      } catch (e) {
        logger.warn`  Skipping block with CID ${cid.toString()} due to decode error: ${e}`;
        continue;
      }
    }
    logger.info(
      `${c.secondary(agent.assertDid)} ${c.primary(results.length)} scrobbles`
    );
  } catch (error) {
    logger.error(`Error fetching scrobbles from CAR: ${error}`);
    throw error;
  }
  return results;
};
export {
  createArtists, createAlbums, createSongs, createScrobbles, downloadCarFile, getRockskyUserArtists, getRockskyUserAlbums, getRockskyUserSongs, getRockskyUserScrobbles,
  createUser,
  subscribeToJetstream,
  sync
};
