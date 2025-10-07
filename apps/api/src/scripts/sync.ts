import chalk from "chalk";
import { ctx } from "context";
import { desc, eq, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { publishScrobble } from "nowplaying/nowplaying.service";
import albums from "../schema/albums";
import artists from "../schema/artists";
import scrobbles from "../schema/scrobbles";
import tracks from "../schema/tracks";
import users from "../schema/users";

const args = process.argv.slice(2);

async function updateUris(did: string) {
  // Get scrobbles with track and user data
  const records = await ctx.db
    .select({
      track: tracks,
      user: users,
    })
    .from(scrobbles)
    .innerJoin(tracks, eq(scrobbles.trackId, tracks.id))
    .innerJoin(users, eq(scrobbles.userId, users.id))
    .where(or(eq(users.did, did), eq(users.handle, did)))
    .orderBy(desc(scrobbles.createdAt))
    .limit(process.env.SYNC_SIZE ? parseInt(process.env.SYNC_SIZE, 10) : 20);

  for (const { track } of records) {
    const trackHash = createHash("sha256")
      .update(`${track.title} - ${track.artist} - ${track.album}`.toLowerCase())
      .digest("hex");

    const existingTrack = await ctx.db
      .select()
      .from(tracks)
      .where(eq(tracks.sha256, trackHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (existingTrack && !existingTrack.albumUri) {
      console.log(`Updating album uri for ${chalk.cyan(track.id)} ...`);

      const albumHash = createHash("sha256")
        .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
        .digest("hex");

      const album = await ctx.db
        .select()
        .from(albums)
        .where(eq(albums.sha256, albumHash))
        .limit(1)
        .then((rows) => rows[0]);

      if (album) {
        await ctx.db
          .update(tracks)
          .set({ albumUri: album.uri })
          .where(eq(tracks.id, existingTrack.id));
      }
    }

    if (existingTrack && !existingTrack.artistUri) {
      console.log(`Updating artist uri for ${chalk.cyan(track.id)} ...`);

      const artistHash = createHash("sha256")
        .update(track.albumArtist.toLowerCase())
        .digest("hex");

      const artist = await ctx.db
        .select()
        .from(artists)
        .where(eq(artists.sha256, artistHash))
        .limit(1)
        .then((rows) => rows[0]);

      if (artist) {
        await ctx.db
          .update(tracks)
          .set({ artistUri: artist.uri })
          .where(eq(tracks.id, existingTrack.id));
      }
    }

    const albumHash = createHash("sha256")
      .update(`${track.album} - ${track.albumArtist}`.toLowerCase())
      .digest("hex");

    const album = await ctx.db
      .select()
      .from(albums)
      .where(eq(albums.sha256, albumHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (existingTrack && album && !album.artistUri) {
      console.log(`Updating artist uri for ${chalk.cyan(album.id)} ...`);

      const artistHash = createHash("sha256")
        .update(track.albumArtist.toLowerCase())
        .digest("hex");

      const artist = await ctx.db
        .select()
        .from(artists)
        .where(eq(artists.sha256, artistHash))
        .limit(1)
        .then((rows) => rows[0]);

      if (artist) {
        await ctx.db
          .update(albums)
          .set({ artistUri: artist.uri })
          .where(eq(albums.id, album.id));
      }
    }
  }
}

if (args.includes("--background")) {
  console.log("Wait for new scrobbles to sync ...");
  const sub = ctx.nc.subscribe("rocksky.user.scrobble.sync");
  for await (const m of sub) {
    const did = new TextDecoder().decode(m.data);
    // wait for 15 seconds to ensure the scrobble is fully created
    await new Promise((resolve) => setTimeout(resolve, 15000));
    console.log(`Syncing scrobbles ${chalk.magenta(did)} ...`);
    await updateUris(did);

    const records = await ctx.db
      .select({
        scrobble: scrobbles,
      })
      .from(scrobbles)
      .innerJoin(users, eq(scrobbles.userId, users.id))
      .where(or(eq(users.did, did), eq(users.handle, did)))
      .orderBy(desc(scrobbles.createdAt))
      .limit(5);

    for (const { scrobble } of records) {
      console.log(`Syncing scrobble ${chalk.cyan(scrobble.id)} ...`);
      await publishScrobble(ctx, scrobble.id);
    }
  }
  process.exit(0);
}

for (const arg of args) {
  console.log(`Syncing scrobbles ${chalk.magenta(arg)} ...`);
  await updateUris(arg);

  const records = await ctx.db
    .select({
      scrobble: scrobbles,
    })
    .from(scrobbles)
    .innerJoin(users, eq(scrobbles.userId, users.id))
    .where(or(eq(users.did, arg), eq(users.handle, arg)))
    .orderBy(desc(scrobbles.createdAt))
    .limit(process.env.SYNC_SIZE ? parseInt(process.env.SYNC_SIZE) : 20);

  for (const { scrobble } of records) {
    console.log(`Syncing scrobble ${chalk.cyan(scrobble.id)} ...`);
    await publishScrobble(ctx, scrobble.id);
  }
  console.log(`Synced ${chalk.greenBright(records.length)} scrobbles`);
}

process.exit(0);
