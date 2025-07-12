import chalk from "chalk";
import { ctx } from "context";
import { and, count, eq } from "drizzle-orm";
import tables from "schema";
import { InsertArtistAlbum } from "schema/artist-albums";

let size = 100;
const total = await ctx.db
  .select({ value: count() })
  .from(tables.tracks)
  .execute()
  .then(([row]) => row.value);

console.log(`Total tracks to process: ${chalk.magentaBright(total)}`);

for (let i = 0; i < total; i += size) {
  const skip = i;
  console.log(
    `Processing ${chalk.magentaBright("tracks")}: ${chalk.magentaBright(skip)} to ${chalk.magentaBright(skip + size)}`
  );
  const results = await ctx.db
    .select()
    .from(tables.tracks)
    .limit(size)
    .offset(skip)
    .execute();

  for (const track of results) {
    if (!track.artistUri || !track.albumUri) {
      console.log(
        `Skipping track ${chalk.cyan(track.title)} due to missing artist or album URI`
      );
      console.log("artistUri", track.artistUri);
      console.log("albumUri", track.albumUri);
      continue;
    }

    const found = await ctx.db
      .select()
      .from(tables.artistAlbums)
      .leftJoin(
        tables.artists,
        eq(tables.artistAlbums.artistId, tables.artists.id)
      )
      .leftJoin(
        tables.albums,
        eq(tables.artistAlbums.albumId, tables.albums.id)
      )
      .where(
        and(
          eq(tables.artists.uri, track.artistUri),
          eq(tables.albums.uri, track.albumUri)
        )
      )
      .limit(1)
      .execute()
      .then((rows) => rows.length > 0);

    if (!found) {
      console.log(`Creating artist-album relationship for track: ${track.uri}`);
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
        console.error(
          `Artist or album not found for track: ${track.uri}. Skipping...`
        );
        console.log("artist", artist);
        console.log("album", album);
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
