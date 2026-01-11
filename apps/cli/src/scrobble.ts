import { MatchTrackResult } from "lib/matchTrack";
import { logger } from "logger";
import dayjs from "dayjs";
import { createAgent } from "lib/agent";
import { getDidAndHandle } from "lib/getDidAndHandle";
import { ctx } from "context";
import schema from "schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import * as Album from "lexicon/types/app/rocksky/album";
import * as Artist from "lexicon/types/app/rocksky/artist";
import * as Scrobble from "lexicon/types/app/rocksky/scrobble";
import * as Song from "lexicon/types/app/rocksky/song";
import { TID } from "@atproto/common";
import { Agent } from "@atproto/api";
import { createUser, subscribeToJetstream } from "cmd/sync";

export async function publishScrobble(
  track: MatchTrackResult,
  timestamp?: number,
) {
  const [did, handle] = await getDidAndHandle();
  const agent: Agent = await createAgent(did, handle);
  const recentScrobble = await getRecentScrobble(did, track, timestamp);
  const user = await createUser(agent, did, handle);
  subscribeToJetstream(user);

  const lockFilePath = path.join(os.tmpdir(), `rocksky-${did}.lock`);

  if (fs.existsSync(lockFilePath)) {
    logger.error(
      `${chalk.greenBright(handle)} Scrobble publishing failed: lock file exists, maybe rocksky-cli is still syncing?\nPlease wait for rocksky to finish syncing before publishing scrobbles or delete the lock file manually ${chalk.greenBright(lockFilePath)}`,
    );
    return false;
  }

  if (recentScrobble) {
    logger.info`${handle} Skipping scrobble for ${track.title} by ${track.artist} at ${timestamp ? dayjs.unix(timestamp).format("YYYY-MM-DD HH:mm:ss") : dayjs().format("YYYY-MM-DD HH:mm:ss")} (already scrobbled)`;
    return true;
  }

  const totalScrobbles = await countScrobbles(did);
  if (totalScrobbles === 0) {
    logger.warn`${handle} No scrobbles found for this user. Are you sure you have successfully synced your scrobbles locally?\nIf not, please run ${"rocksky sync"} to sync your scrobbles before publishing scrobbles.`;
  }

  logger.info`${handle} Publishing scrobble for ${track.title} by ${track.artist} at ${timestamp ? dayjs.unix(timestamp).format("YYYY-MM-DD HH:mm:ss") : dayjs().format("YYYY-MM-DD HH:mm:ss")}`;

  // putSongRecord
  // putArtistRecord
  // putAlbumRecord
  // putScrobbleRecord

  return true;
}

async function getRecentScrobble(
  did: string,
  track: MatchTrackResult,
  timestamp?: number,
) {
  const scrobbleTime = dayjs.unix(timestamp || dayjs().unix());
  return ctx.db
    .select({
      scrobble: schema.scrobbles,
      user: schema.users,
      track: schema.tracks,
    })
    .from(schema.scrobbles)
    .innerJoin(schema.users, eq(schema.scrobbles.userId, schema.users.id))
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .where(
      and(
        eq(schema.users.did, did),
        eq(schema.tracks.title, track.title),
        eq(schema.tracks.artist, track.artist),
        gte(
          schema.scrobbles.timestamp,
          scrobbleTime.subtract(60, "seconds").toDate(),
        ),
        lte(
          schema.scrobbles.timestamp,
          scrobbleTime.add(60, "seconds").toDate(),
        ),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
}

async function countScrobbles(did: string): Promise<number> {
  return ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(schema.scrobbles)
    .innerJoin(schema.users, eq(schema.scrobbles.userId, schema.users.id))
    .where(eq(schema.users.did, did))
    .then((rows) => rows[0].count);
}

async function putSongRecord(agent: Agent, track: MatchTrackResult) {
  const rkey = TID.nextStr();

  const record: Song.Record = {
    $type: "app.rocksky.song",
    title: track.title,
    artist: track.artist,
    artists: track.mbArtists === null ? undefined : track.mbArtists,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    releaseDate: track.releaseDate
      ? new Date(track.releaseDate).toISOString()
      : undefined,
    year: track.year === null ? undefined : track.year,
    albumArtUrl: track.albumArt,
    composer: track.composer ? track.composer : undefined,
    lyrics: track.lyrics ? track.lyrics : undefined,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber === 0 ? 1 : track.discNumber,
    copyrightMessage: track.copyrightMessage
      ? track.copyrightMessage
      : undefined,
    createdAt: new Date().toISOString(),
    spotifyLink: track.spotifyLink ? track.spotifyLink : undefined,
    tags: track.genres || [],
    mbid: track.mbId,
  };

  if (!Song.validateRecord(record).success) {
    logger.info`${Song.validateRecord(record)}`;
    logger.info`${record}`;
    throw new Error("Invalid Song record");
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
    logger.info`Song record created at ${uri}`;
    return uri;
  } catch (e) {
    logger.error`Error creating song record: ${e}`;
    return null;
  }
}

async function putArtistRecord(agent: Agent, track: MatchTrackResult) {
  const rkey = TID.nextStr();
  const record: Artist.Record = {
    $type: "app.rocksky.artist",
    name: track.albumArtist,
    createdAt: new Date().toISOString(),
    pictureUrl: track.artistPicture || undefined,
    tags: track.genres || [],
  };

  if (!Artist.validateRecord(record).success) {
    logger.info`${Artist.validateRecord(record)}`;
    logger.info`${JSON.stringify(record, null, 2)}`;
    throw new Error("Invalid Artist record");
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

async function putAlbumRecord(agent: Agent, track: MatchTrackResult) {
  const rkey = TID.nextStr();

  const record = {
    $type: "app.rocksky.album",
    title: track.album,
    artist: track.albumArtist,
    year: track.year === null ? undefined : track.year,
    releaseDate: track.releaseDate
      ? new Date(track.releaseDate).toISOString()
      : undefined,
    createdAt: new Date().toISOString(),
    albumArtUrl: track.albumArt,
  };

  if (!Album.validateRecord(record).success) {
    logger.info`${Album.validateRecord(record)}`;
    logger.info`${record}`;
    throw new Error("Invalid Album record");
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
    logger.info`Album record created at ${uri}`;
    return uri;
  } catch (e) {
    logger.error`Error creating album record: ${e}`;
    return null;
  }
}

async function putScrobbleRecord(agent: Agent, track: MatchTrackResult) {}
