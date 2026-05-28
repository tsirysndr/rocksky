import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const userStorageProviders = pgTable(
  "user_storage_providers",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    label: text("label").notNull(),
    endpoint: text("endpoint").notNull(),
    region: text("region").notNull().default("auto"),
    bucket: text("bucket").notNull(),
    accessKey: text("access_key").notNull(),
    secretKey: text("secret_key").notNull(),
    publicUrl: text("public_url"),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [index("user_storage_providers_user_id_idx").on(t.userId)],
);

export type SelectUserStorageProvider = InferSelectModel<
  typeof userStorageProviders
>;
export type InsertUserStorageProvider = InferInsertModel<
  typeof userStorageProviders
>;

export default userStorageProviders;
