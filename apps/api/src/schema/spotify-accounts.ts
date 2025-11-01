import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import users from "./users";

const spotifyAccounts = pgTable("spotify_accounts", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  xataVersion: integer("xata_version"),
  email: text("email").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  isBetaUser: boolean("is_beta_user").default(false).notNull(),
  spotifyAppId: text("spotify_app_id"),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SelectSpotifyAccount = InferSelectModel<typeof spotifyAccounts>;
export type InsertSpotifyAccount = InferInsertModel<typeof spotifyAccounts>;

export default spotifyAccounts;
