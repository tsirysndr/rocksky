import { equals } from "@xata.io/client";
import chalk from "chalk";
import { ctx } from "context";
import { createHash } from "crypto";
import { publishScrobble } from "nowplaying/nowplaying.service";

const args = process.argv.slice(2);

async function updateUris(did: string) {
  const { records } = await ctx.client.db.scrobbles
    .select(["track_id.*", "user_id.*"])
    .filter({
      $any: [{ "user_id.did": did }, { "user_id.handle": did }],
    })
    .getPaginated({
      pagination: {
        size: process.env.SYNC_SIZE ? parseInt(process.env.SYNC_SIZE) : 20,
      },
      sort: [{ xata_createdat: "desc" }],
    });
  for (const { track_id: track } of records) {
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

    if (existingTrack && !existingTrack.album_uri) {
      console.log(`Updating album uri for ${chalk.cyan(track.xata_id)} ...`);
      const album = await ctx.client.db.albums
        .filter(
          "sha256",
          equals(
            createHash("sha256")
              .update(`${track.album} - ${track.album_artist}`.toLowerCase())
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
      console.log(`Updating artist uri for ${chalk.cyan(track.xata_id)} ...`);
      const artist = await ctx.client.db.artists
        .filter(
          "sha256",
          equals(
            createHash("sha256")
              .update(track.album_artist.toLowerCase())
              .digest("hex")
          )
        )
        .getFirst();
      if (artist) {
        await ctx.client.db.tracks.update(existingTrack.xata_id, {
          artist_uri: artist.uri,
        });

        const album = await ctx.client.db.albums
          .filter(
            "sha256",
            equals(
              createHash("sha256")
                .update(`${track.album} - ${track.album_artist}`.toLowerCase())
                .digest("hex")
            )
          )
          .getFirst();
        if (album) {
          await ctx.client.db.albums.update(album.xata_id, {
            artist_uri: artist.uri,
          });
        }
      }
    }
  }
}

for (const arg of args) {
  console.log(`Syncing scrobbles ${chalk.magenta(arg)} ...`);
  await updateUris(arg);

  const { records } = await ctx.client.db.scrobbles
    .filter({
      $any: [{ "user_id.did": arg }, { "user_id.handle": arg }],
    })
    .getPaginated({
      pagination: {
        size: process.env.SYNC_SIZE ? parseInt(process.env.SYNC_SIZE) : 20,
      },
      sort: [{ xata_createdat: "desc" }],
    });
  for (const scrobble of records) {
    console.log(`Syncing scrobble ${chalk.cyan(scrobble.xata_id)} ...`);
    await publishScrobble(ctx, scrobble.xata_id);
  }
  console.log(`Synced ${chalk.greenBright(records.length)} scrobbles`);
}

process.exit(0);
