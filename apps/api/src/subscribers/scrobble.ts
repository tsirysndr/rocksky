import { consola } from "consola";
import type { Context } from "context";
import { eq, or, desc } from "drizzle-orm";
import _ from "lodash";
import { StringCodec } from "nats";
import { createHash } from "node:crypto";
import tables from "schema";
import chalk from "chalk";
import { publishScrobble } from "nowplaying/nowplaying.service";

export function onNewScrobble(ctx: Context) {
  const sc = StringCodec();
  const sub = ctx.nc.subscribe("rocksky.scrobble.new");
  (async () => {
    for await (const m of sub) {
      const scrobbleId = sc.decode(m.data);
      const result = await ctx.db
        .select()
        .from(tables.scrobbles)
        .where(eq(tables.scrobbles.id, scrobbleId))
        .leftJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
        .execute()
        .then((rows) => rows[0]);

      if (!result) {
        consola.info(`Scrobble with ID ${scrobbleId} not found, skipping`);
        continue;
      }

      await updateUris(ctx, result.users.did);
      await refreshScrobbles(ctx, result.users.did);
    }
  })();
}

async function updateUris(ctx: Context, did: string) {
  // Get scrobbles with track and user data
  const records = await ctx.db
    .select({
      track: tables.tracks,
      user: tables.users,
    })
    .from(tables.scrobbles)
    .innerJoin(tables.tracks, eq(tables.scrobbles.trackId, tables.tracks.id))
    .innerJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
    .where(or(eq(tables.users.did, did), eq(tables.users.handle, did)))
    .orderBy(desc(tables.scrobbles.createdAt))
    .limit(5);

  for (const { track } of records) {
    const trackHash = createHash("sha256")
      .update(`${track.title} - ${track.artist} - ${track.album}`.toLowerCase())
      .digest("hex");

    const existingTrack = await ctx.db
      .select()
      .from(tables.tracks)
      .where(eq(tables.tracks.sha256, trackHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (existingTrack && !existingTrack.albumUri) {
      consola.info(`Updating album uri for ${chalk.cyan(track.id)} ...`);

      const albumHash = createHash("sha256")
        .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
        .digest("hex");

      const album = await ctx.db
        .select()
        .from(tables.albums)
        .where(eq(tables.albums.sha256, albumHash))
        .limit(1)
        .then((rows) => rows[0]);

      if (album) {
        await ctx.db
          .update(tables.tracks)
          .set({ albumUri: album.uri })
          .where(eq(tables.tracks.id, existingTrack.id));
      }
    }

    if (existingTrack && !existingTrack.artistUri) {
      consola.info(`Updating artist uri for ${chalk.cyan(track.id)} ...`);

      const artistHash = createHash("sha256")
        .update(track.albumArtist.toLowerCase())
        .digest("hex");

      const artist = await ctx.db
        .select()
        .from(tables.artists)
        .where(eq(tables.artists.sha256, artistHash))
        .limit(1)
        .then((rows) => rows[0]);

      if (artist) {
        await ctx.db
          .update(tables.tracks)
          .set({ artistUri: artist.uri })
          .where(eq(tables.tracks.id, existingTrack.id));
      }
    }

    const albumHash = createHash("sha256")
      .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
      .digest("hex");

    const album = await ctx.db
      .select()
      .from(tables.albums)
      .where(eq(tables.albums.sha256, albumHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (existingTrack && album && !album.artistUri) {
      consola.info(`Updating artist uri for ${chalk.cyan(album.id)} ...`);

      const artistHash = createHash("sha256")
        .update(track.albumArtist.toLowerCase())
        .digest("hex");

      const artist = await ctx.db
        .select()
        .from(tables.artists)
        .where(eq(tables.artists.sha256, artistHash))
        .limit(1)
        .then((rows) => rows[0]);

      if (artist) {
        await ctx.db
          .update(tables.albums)
          .set({ artistUri: artist.uri })
          .where(eq(tables.albums.id, album.id));
      }
    }
  }
}

async function refreshScrobbles(ctx: Context, did: string) {
  const records = await ctx.db
    .select({
      scrobble: tables.scrobbles,
    })
    .from(tables.scrobbles)
    .innerJoin(tables.users, eq(tables.scrobbles.userId, tables.users.id))
    .where(or(eq(tables.users.did, did), eq(tables.users.handle, did)))
    .orderBy(desc(tables.scrobbles.createdAt))
    .limit(5);

  for (const { scrobble } of records) {
    consola.info(`Syncing scrobble ${chalk.cyan(scrobble.id)} ...`);
    try {
      await publishScrobble(ctx, scrobble.id);
    } catch (err) {
      consola.error(`Failed to sync scrobble ${chalk.cyan(scrobble.id)}:`, err);
    }
  }
  consola.info(`Synced ${chalk.greenBright(records.length)} scrobbles`);
}
