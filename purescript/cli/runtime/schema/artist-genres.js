import { sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
const artistGenres = sqliteTable(
  "artist_genres ",
  {
    id: text("id").primaryKey().notNull(),
    artistId: text("artist_id").notNull(),
    genreId: text("genre_id").notNull()
  },
  (t) => [unique("artist_genre_unique_index").on(t.artistId, t.genreId)]
);
var stdin_default = artistGenres;
export {
  stdin_default as default
};
