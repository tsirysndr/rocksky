import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// The master groups every edition of a release. Its year is the original one,
// which is what a reissue's own year is not. Releases point at it by Discogs
// id rather than by FK: the master is only fetched when it is worth a request
// out of the quota, so a release may land before its master does.
const discogsMasters = pgTable("discogs_masters", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  discogsId: integer("discogs_id").notNull().unique(),
  title: text("title").notNull(),
  artist: text("artist"),
  year: integer("year"),
  mainReleaseId: integer("main_release_id"),
  discogsUrl: text("discogs_url"),
  genres: text("genres").array(),
  styles: text("styles").array(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version"),
});

export type SelectDiscogsMaster = InferSelectModel<typeof discogsMasters>;
export type InsertDiscogsMaster = InferInsertModel<typeof discogsMasters>;

export default discogsMasters;
