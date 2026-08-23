import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const playlists = pgTable("playlists", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  name: text("name").notNull(),
  picture: text("picture"),
  description: text("description"),
  // Rows only ever come from a jetstream commit, so every playlist has the
  // AT-URI and CID of the record it was built from. A CHECK constraint enforces
  // uri IS NOT NULL for anything written from now on.
  uri: text("uri").unique(),
  cid: text("cid"),
  // Reserved. Collaborative playlists were pulled before shipping — an entry
  // record lives in its author's repo, so an owner cannot retract a
  // collaborator's song, and that needs designing first. Nothing reads or
  // writes this; kept so re-adding it needs no migration.
  collaborators: text("collaborators").array(),
  spotifyLink: text("spotify_link"),
  tidalLink: text("tidal_link"),
  appleMusicLink: text("apple_music_link"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectPlaylist = InferSelectModel<typeof playlists>;
export type InsertPlaylist = InferInsertModel<typeof playlists>;

export default playlists;
