import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const artistGenres = sqliteTable(
  "artist_genres ",
  {
    id: text("id").primaryKey().notNull(),
    artistId: text("artist_id").notNull(),
    genreId: text("genre_id").notNull(),
  },
  (t) => [unique("artist_genre_unique_index").on(t.artistId, t.genreId)],
);

export type SelectArtistGenre = InferSelectModel<typeof artistGenres>;
export type InsertArtistGenre = InferInsertModel<typeof artistGenres>;

export default artistGenres;
