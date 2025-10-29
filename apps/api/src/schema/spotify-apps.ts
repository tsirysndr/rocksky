import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const spotifyApps = pgTable("spotify_apps", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  xataVersion: integer("xata_version"),
  spotifyAppId: text("spotify_app_id").unique().notNull(),
  spotifySecret: text("spotify_secret").notNull(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectSpotifyApp = InferSelectModel<typeof spotifyApps>;
export type InsertSpotifyApp = InferInsertModel<typeof spotifyApps>;

export default spotifyApps;
