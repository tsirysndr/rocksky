import { JetStreamClient, JetStreamEvent } from "jetstream";
import { logger } from "logger";
import { ctx } from "context";
import { isValidHandle } from "@atproto/syntax";
import { Agent } from "@atproto/api";
import { env } from "lib/env";
import { createAgent } from "lib/agent";
import chalk from "chalk";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Song from "lexicon/types/app/rocksky/song";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import { SelectUser } from "schema/users";
import schema from "schema";
import { createId } from "@paralleldrive/cuid2";
import _ from "lodash";

type Artists = { value: Artist.Record; uri: string; cid: string }[];
type Albums = { value: Album.Record; uri: string; cid: string }[];
type Songs = { value: Song.Record; uri: string; cid: string }[];
type Scrobbles = { value: Scrobble.Record; uri: string; cid: string }[];

export async function sync() {
  const [did, handle] = await getDidAndHandle();
  const agent: Agent = await createAgent(did, handle);

  const user = await createUser(agent, did, handle);
  subscribeToJetstream(did);

  logger.info`  DID: ${did}`;
  logger.info`  Handle: ${handle}`;

  const [artists, albums, songs, scrobbles] = await Promise.all([
    getRockskyUserArtists(agent),
    getRockskyUserAlbums(agent),
    getRockskyUserSongs(agent),
    getRockskyUserScrobbles(agent),
  ]);

  logger.info`  Artists: ${artists.length}`;
  logger.info`  Albums: ${albums.length}`;
  logger.info`  Songs: ${songs.length}`;
  logger.info`  Scrobbles: ${scrobbles.length}`;

  await createArtists(artists, user);
  await createAlbums(albums, user);
  await createSongs(songs, user);
  await createScrobbles(scrobbles, user);
}

const getEndpoint = () => {
  const endpoint = env.JETSTREAM_SERVER;

  if (endpoint?.endsWith("/subscribe")) {
    return endpoint;
  }

  return `${endpoint}/subscribe`;
};

const getDidAndHandle = async (): Promise<[string, string]> => {
  let handle = env.ROCKSKY_HANDLE || env.ROCKSKY_IDENTIFIER;
  let did = env.ROCKSKY_HANDLE || env.ROCKSKY_IDENTIFIER;

  if (handle.startsWith("did:plc:") || handle.startsWith("did:web:")) {
    handle = await ctx.resolver.resolveDidToHandle(handle);
  }

  if (!isValidHandle(handle)) {
    logger.error`❌ Invalid handle: ${handle}`;
    process.exit(1);
  }

  if (!did.startsWith("did:plc:") && !did.startsWith("did:web:")) {
    did = await ctx.baseIdResolver.handle.resolve(did);
  }

  return [did, handle];
};

const createUser = async (
  agent: Agent,
  did: string,
  handle: string,
): Promise<SelectUser> => {
  const { data: profileRecord } = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: "app.bsky.actor.profile",
    rkey: "self",
  });

  const displayName = _.get(profileRecord, "value.displayName") as
    | string
    | undefined;
  const avatar = `https://cdn.bsky.app/img/avatar/plain/${did}/${_.get(profileRecord, "value.avatar.ref", "").toString()}@jpeg`;

  const [user] = await ctx.db
    .insert(schema.users)
    .values({
      id: createId(),
      did,
      handle,
      displayName,
      avatar,
    })
    .onConflictDoUpdate({
      target: schema.users.did,
      set: {
        handle,
        displayName,
        avatar,
        updatedAt: new Date(),
      },
    })
    .returning()
    .execute();

  return user;
};

const createArtists = async (artists: Artists, _user: SelectUser) => {
  if (artists.length === 0) return;

  await ctx.db
    .insert(schema.artists)
    .values(
      artists.map((artist) => ({
        id: createId(),
        name: artist.value.name,
        cid: artist.cid,
        uri: artist.uri,
        biography: artist.value.bio,
        born: artist.value.born ? new Date(artist.value.born) : null,
        bornIn: artist.value.bornIn,
        died: artist.value.died ? new Date(artist.value.died) : null,
        picture: artist.value.pictureUrl,
        sha256: artist.value.sha256 as string,
        genres: (artist.value.genres as string[]).join(", "),
      })),
    )
    .onConflictDoNothing({
      target: schema.artists.cid,
    })
    .returning()
    .execute();
};

const createAlbums = async (albums: Albums, user: SelectUser) => {
  if (albums.length === 0) return;

  await ctx.db
    .insert(schema.albums)
    .values(
      albums.map((album) => ({
        id: createId(),
        cid: album.cid,
        title: "",
        artist: "",
        sha256: "",
        uri: album.uri,
        mbid: "",
        description: "",
        imageUrl: "",
        spotifyId: "",
        appleMusicId: "",
        genres: "",
        releaseDate: "",
        year: undefined,
      })),
    )
    .onConflictDoNothing({
      target: schema.albums.cid,
    })
    .returning()
    .execute();
};

const createSongs = async (songs: Songs, user: SelectUser) => {
  if (songs.length === 0) return;

  await ctx.db
    .insert(schema.tracks)
    .values(
      songs.map((song) => ({
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
        albumUri: "",
        artistUri: "",
      })),
    )
    .onConflictDoNothing({
      target: schema.tracks.cid,
    })
    .returning()
    .execute();
};

const createScrobbles = async (scrobbles: Scrobbles, user: SelectUser) => {
  if (!scrobbles.length) return;

  await ctx.db
    .insert(schema.scrobbles)
    .values(
      scrobbles.map((scrobble) => ({
        id: createId(),
        trackId: "",
        userId: user.id,
        timestamp: new Date(),
      })),
    )
    .onConflictDoNothing({
      target: schema.scrobbles.cid,
    })
    .returning()
    .execute();
};

const subscribeToJetstream = (_did: string) => {
  const client = new JetStreamClient({
    wantedCollections: [
      "app.rocksky.scrobble",
      "app.rocksky.artist",
      "app.rocksky.album",
      "app.rocksky.song",
    ],
    endpoint: getEndpoint(),

    // Optional: filter by specific DIDs
    // wantedDids: [did],

    // Reconnection settings
    maxReconnectAttempts: 10,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    backoffMultiplier: 1.5,

    // Enable debug logging
    debug: true,
  });

  client.on("open", () => {
    logger.info`✅ Connected to JetStream!`;
  });

  client.on("message", async (data) => {
    const event = data as JetStreamEvent;

    if (event.kind === "commit" && event.commit) {
      const { operation, collection, record, rkey } = event.commit;
      const uri = `at://${event.did}/${collection}/${rkey}`;

      logger.info`\n📡 New event:`;
      logger.info`  Operation: ${operation}`;
      logger.info`  Collection: ${collection}`;
      logger.info`  DID: ${event.did}`;
      logger.info`  Uri: ${uri}`;

      if (operation === "create" && record) {
        console.log(JSON.stringify(record, null, 2));
      }

      logger.info`  Cursor: ${event.time_us}`;
    }
  });

  client.on("error", (error) => {
    logger.error`❌ Error:  ${error}`;
  });

  client.on("reconnect", (data) => {
    const { attempt } = data as { attempt: number };
    logger.info`🔄 Reconnecting... (attempt ${attempt})`;
  });

  client.connect();
};

const getRockskyUserSongs = async (agent: Agent): Promise<Songs> => {
  let results: {
    value: Song.Record;
    uri: string;
    cid: string;
  }[] = [];
  let cursor: string | undefined;
  let i = 1;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid,
      collection: "app.rocksky.song",
      limit: 100,
      cursor,
    });
    const records = res.data.records as Array<{
      uri: string;
      cid: string;
      value: Song.Record;
    }>;
    results = results.concat(records);
    cursor = res.data.cursor;
    logger.info(`${chalk.greenBright(i)} songs`);
    i += 100;
  } while (cursor);

  return results;
};

const getRockskyUserAlbums = async (agent: Agent): Promise<Albums> => {
  let results: {
    value: Album.Record;
    uri: string;
    cid: string;
  }[] = [];
  let cursor: string | undefined;
  let i = 1;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid,
      collection: "app.rocksky.album",
      limit: 100,
      cursor,
    });

    const records = res.data.records as Array<{
      uri: string;
      cid: string;
      value: Album.Record;
    }>;

    results = results.concat(records);

    cursor = res.data.cursor;
    logger.info(`${chalk.greenBright(i)} albums`);
    i += 100;
  } while (cursor);

  return results;
};

const getRockskyUserArtists = async (agent: Agent): Promise<Artists> => {
  let results: {
    value: Artist.Record;
    uri: string;
    cid: string;
  }[] = [];
  let cursor: string | undefined;
  let i = 1;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid,
      collection: "app.rocksky.artist",
      limit: 100,
      cursor,
    });

    const records = res.data.records as Array<{
      uri: string;
      cid: string;
      value: Artist.Record;
    }>;

    results = results.concat(records);

    cursor = res.data.cursor;
    logger.info(`${chalk.greenBright(i)} artists`);
    i += 100;
  } while (cursor);

  return results;
};

const getRockskyUserScrobbles = async (agent: Agent): Promise<Scrobbles> => {
  let results: {
    value: Scrobble.Record;
    uri: string;
    cid: string;
  }[] = [];
  let cursor: string | undefined;
  let i = 1;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid,
      collection: "app.rocksky.scrobble",
      limit: 100,
      cursor,
    });

    const records = res.data.records as Array<{
      uri: string;
      cid: string;
      value: Scrobble.Record;
    }>;

    results = results.concat(records);

    cursor = res.data.cursor;
    logger.info(`${chalk.greenBright(i)} scrobbles`);
    i += 100;
  } while (cursor);

  return results;
};
