import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { and, count, eq } from "drizzle-orm";
import tables from "schema";
import type { InsertArtistAlbum } from "schema/artist-albums";

const size = 100;
const total = await ctx.db
  .select({ value: count() })
  .from(tables.tracks)
  .execute()
  .then(([row]) => row.value);

consola.info(`Total tracks to process: ${chalk.magentaBright(total)}`);

for (let i = 0; i < total; i += size) {
  const skip = i;
  consola.info(
    `Processing ${chalk.magentaBright("tracks")}: ${chalk.magentaBright(skip)} to ${chalk.magentaBright(skip + size)}`,
  );
  const results = await ctx.db
    .select()
    .from(tables.tracks)
    .limit(size)
    .offset(skip)
    .execute();

  for (const track of results) {
    if (!track.artistUri || !track.albumUri) {
      consola.info(
        `Deleting album-track relationship for track: ${chalk.redBright(track.uri)}`,
      );
      consola.info("artistUri", track.artistUri);
      consola.info("albumUri", track.albumUri);
      continue;
    }

    const found = await ctx.db
      .select()
      .from(tables.artistAlbums)
      .leftJoin(
        tables.artists,
        eq(tables.artistAlbums.artistId, tables.artists.id),
      )
      .leftJoin(
        tables.albums,
        eq(tables.artistAlbums.albumId, tables.albums.id),
      )
      .where(
        and(
          eq(tables.artists.uri, track.artistUri),
          eq(tables.albums.uri, track.albumUri),
        ),
      )
      .limit(1)
      .execute()
      .then((rows) => rows.length > 0);

    if (!found) {
      consola.info(
        `Creating artist-album relationship for track: ${track.uri}`,
      );
      const [artist, album] = await Promise.all([
        ctx.db
          .select()
          .from(tables.artists)
          .where(eq(tables.artists.uri, track.artistUri))
          .limit(1)
          .execute()
          .then((rows) => rows[0]),
        ctx.db
          .select()
          .from(tables.albums)
          .where(eq(tables.albums.uri, track.albumUri))
          .limit(1)
          .execute()
          .then((rows) => rows[0]),
      ]);

      if (!artist || !album) {
        consola.error(
          `Artist-album relationship already exists for track: ${chalk.redBright(track.uri)}`,
        );
        consola.info("artist", artist);
        consola.info("album", album);
        continue;
      }

      await ctx.db
        .insert(tables.artistAlbums)
        .values({
          artistId: artist.id,
          albumId: album.id,
        } as InsertArtistAlbum)
        .execute();
    }
  }
}

process.exit(0);
