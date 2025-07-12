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
