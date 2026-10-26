import { logger } from "./logger.js";
import dayjs from "dayjs";
import { createAgent } from "./lib/agent.js";
import { getDidAndHandle } from "./lib/getDidAndHandle.js";
import { ctx } from "./context.js";
import schema from "./schema/index.js";
import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { c } from "./theme.js";
import * as Album from "./lexicon/types/app/rocksky/album.js";
import * as Artist from "./lexicon/types/app/rocksky/artist.js";
import * as Scrobble from "./lexicon/types/app/rocksky/scrobble.js";
import * as Song from "./lexicon/types/app/rocksky/song.js";
import { TID } from "@atproto/common";
import { createUser, subscribeToJetstream, sync } from "./cmd/sync.js";
import _ from "lodash";
async function publishScrobble(track, timestamp, dryRun) {
  const [did, handle] = await getDidAndHandle();
  const agent = await createAgent(did, handle);
  const recentScrobble = await getRecentScrobble(did, track, timestamp);
  const user = await createUser(agent, did, handle);
  await subscribeToJetstream(user);
  const lockFilePath = path.join(os.tmpdir(), `rocksky-${did}.lock`);
  if (fs.existsSync(lockFilePath)) {
    logger.error(
      `${c.primary(handle)} Scrobble publishing failed: lock file exists, maybe rocksky-cli is still syncing?
Please wait for rocksky to finish syncing before publishing scrobbles or delete the lock file manually ${c.primary(lockFilePath)}`
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
  if (await shouldSync(agent)) {
    logger.info`${handle} Syncing scrobbles before publishing`;
    await sync();
  } else {
    logger.info`${handle} Local scrobbles are up-to-date, skipping sync`;
  }
  if (dryRun) {
    logger.info`${handle} Dry run: Skipping publishing scrobble for ${track.title} by ${track.artist} at ${timestamp ? dayjs.unix(timestamp).format("YYYY-MM-DD HH:mm:ss") : dayjs().format("YYYY-MM-DD HH:mm:ss")}`;
    return true;
  }
  const existingTrack = await ctx.db.select().from(schema.tracks).where(
    or(
      and(
        sql`LOWER(${schema.tracks.title}) = LOWER(${track.title})`,
        sql`LOWER(${schema.tracks.artist}) = LOWER(${track.artist})`
      ),
      and(
        sql`LOWER(${schema.tracks.title}) = LOWER(${track.title})`,
        sql`LOWER(${schema.tracks.albumArtist}) = LOWER(${track.artist})`
      ),
      and(
        sql`LOWER(${schema.tracks.title}) = LOWER(${track.title})`,
        sql`LOWER(${schema.tracks.albumArtist}) = LOWER(${track.albumArtist})`
      )
    )
  ).limit(1).execute().then((rows) => rows[0]);
  if (!existingTrack) {
    await putSongRecord(agent, track);
  }
  const existingArtist = await ctx.db.select().from(schema.artists).where(
    or(
      sql`LOWER(${schema.artists.name}) = LOWER(${track.artist})`,
      sql`LOWER(${schema.artists.name}) = LOWER(${track.albumArtist})`
    )
  ).limit(1).execute().then((rows) => rows[0]);
  if (!existingArtist) {
    await putArtistRecord(agent, track);
  }
  const existingAlbum = await ctx.db.select().from(schema.albums).where(
    and(
      sql`LOWER(${schema.albums.title}) = LOWER(${track.album})`,
      sql`LOWER(${schema.albums.artist}) = LOWER(${track.albumArtist})`
    )
  ).limit(1).execute().then((rows) => rows[0]);
  if (!existingAlbum) {
    await putAlbumRecord(agent, track);
  }
  const scrobbleUri = await putScrobbleRecord(agent, track, timestamp);
  if (scrobbleUri) {
    const MAX_ATTEMPTS = 40;
    let attempts = 0;
    do {
      const count = await ctx.db.select({
        count: sql`COUNT(*)`
      }).from(schema.scrobbles).where(eq(schema.scrobbles.uri, scrobbleUri)).execute().then((rows) => _.get(rows, "[0].count", 0));
      if (count > 0 || attempts >= MAX_ATTEMPTS) {
        if (attempts == MAX_ATTEMPTS) {
          logger.error`Failed to detect published scrobble after ${MAX_ATTEMPTS} attempts`;
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
      attempts += 1;
    } while (true);
  }
  return true;
}
async function getRecentScrobble(did, track, timestamp) {
  const scrobbleTime = dayjs.unix(timestamp || dayjs().unix());
  return ctx.db.select({
    scrobble: schema.scrobbles,
    user: schema.users,
    track: schema.tracks
  }).from(schema.scrobbles).innerJoin(schema.users, eq(schema.scrobbles.userId, schema.users.id)).innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id)).where(
    and(
      eq(schema.users.did, did),
      sql`LOWER(${schema.tracks.title}) = LOWER(${track.title})`,
      sql`LOWER(${schema.tracks.artist}) = LOWER(${track.artist})`,
      gte(
        schema.scrobbles.timestamp,
        scrobbleTime.subtract(60, "seconds").toDate()
      ),
      lte(
        schema.scrobbles.timestamp,
        scrobbleTime.add(60, "seconds").toDate()
      )
    )
  ).limit(1).then((rows) => rows[0]);
}
async function countScrobbles(did) {
  return ctx.db.select({ count: sql`count(*)` }).from(schema.scrobbles).innerJoin(schema.users, eq(schema.scrobbles.userId, schema.users.id)).where(eq(schema.users.did, did)).then((rows) => rows[0].count);
}
async function putSongRecord(agent, track) {
  const rkey = TID.nextStr();
  const record = {
    $type: "app.rocksky.song",
    title: track.title,
    artist: track.artist,
    artists: track.mbArtists === null ? void 0 : track.mbArtists,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    releaseDate: track.releaseDate ? new Date(track.releaseDate).toISOString() : void 0,
    year: track.year === null ? void 0 : track.year,
    albumArtUrl: track.albumArt,
    composer: track.composer ? track.composer : void 0,
    lyrics: track.lyrics ? track.lyrics : void 0,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber === 0 ? 1 : track.discNumber,
    copyrightMessage: track.copyrightMessage ? track.copyrightMessage : void 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    spotifyLink: track.spotifyLink ? track.spotifyLink : void 0,
    tags: track.genres || [],
    mbid: track.mbId
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
      validate: false
    });
    const uri = res.data.uri;
    logger.info`Song record created at ${uri}`;
    return uri;
  } catch (e) {
    logger.error`Error creating song record: ${e}`;
    return null;
  }
}
async function putArtistRecord(agent, track) {
  const rkey = TID.nextStr();
  const record = {
    $type: "app.rocksky.artist",
    name: track.albumArtist,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    pictureUrl: track.artistPicture || void 0,
    tags: track.genres || []
  };
  if (!Artist.validateRecord(record).success) {
    logger.info`${Artist.validateRecord(record)}`;
    logger.info`${record}`;
    throw new Error("Invalid Artist record");
  }
  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.artist",
      rkey,
      record,
      validate: false
    });
    const uri = res.data.uri;
    logger.info`Artist record created at ${uri}`;
    return uri;
  } catch (e) {
    logger.error`Error creating artist record: ${e}`;
    return null;
  }
}
async function putAlbumRecord(agent, track) {
  const rkey = TID.nextStr();
  const record = {
    $type: "app.rocksky.album",
    title: track.album,
    artist: track.albumArtist,
    year: track.year === null ? void 0 : track.year,
    releaseDate: track.releaseDate ? new Date(track.releaseDate).toISOString() : void 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    albumArtUrl: track.albumArt
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
      validate: false
    });
    const uri = res.data.uri;
    logger.info`Album record created at ${uri}`;
    return uri;
  } catch (e) {
    logger.error`Error creating album record: ${e}`;
    return null;
  }
}
async function putScrobbleRecord(agent, track, timestamp) {
  const rkey = TID.nextStr();
  const record = {
    $type: "app.rocksky.scrobble",
    title: track.title,
    albumArtist: track.albumArtist,
    albumArtUrl: track.albumArt,
    artist: track.artist,
    artists: track.mbArtists === null ? void 0 : track.mbArtists,
    album: track.album,
    duration: track.duration,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber === 0 ? 1 : track.discNumber,
    releaseDate: track.releaseDate ? new Date(track.releaseDate).toISOString() : void 0,
    year: track.year === null ? void 0 : track.year,
    composer: track.composer ? track.composer : void 0,
    lyrics: track.lyrics ? track.lyrics : void 0,
    copyrightMessage: track.copyrightMessage ? track.copyrightMessage : void 0,
    createdAt: timestamp ? dayjs.unix(timestamp).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
    spotifyLink: track.spotifyLink ? track.spotifyLink : void 0,
    tags: track.genres || [],
    mbid: track.mbId
  };
  if (!Scrobble.validateRecord(record).success) {
    logger.info`${Scrobble.validateRecord(record)}`;
    logger.info`${record}`;
    throw new Error("Invalid Scrobble record");
  }
  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.scrobble",
      rkey,
      record,
      validate: false
    });
    const uri = res.data.uri;
    logger.info`Scrobble record created at ${uri}`;
    return uri;
  } catch (e) {
    logger.error`Error creating scrobble record: ${e}`;
    return null;
  }
}
async function shouldSync(agent) {
  const res = await agent.com.atproto.repo.listRecords({
    repo: agent.assertDid,
    collection: "app.rocksky.scrobble",
    limit: 1
  });
  const records = res.data.records;
  if (!records.length) {
    logger.info`No scrobble records found`;
    return true;
  }
  const { count } = await ctx.db.select({
    count: sql`count(*)`
  }).from(schema.scrobbles).where(eq(schema.scrobbles.cid, records[0].cid)).execute().then((result) => result[0]);
  return count === 0;
}
export {
  publishScrobble
};
