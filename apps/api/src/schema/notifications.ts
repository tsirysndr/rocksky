import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import shouts from "./shouts";
import users from "./users";

/**
 * A single notification row per event. `type` is one of:
 *  - "like_scrobble"    — someone liked the recipient's song/scrobble
 *  - "follow"           — someone followed the recipient
 *  - "comment_scrobble" — someone commented on the recipient's scrobble
 *  - "comment_profile"  — someone commented on the recipient's profile
 *  - "reply"            — someone replied to the recipient's comment
 *  - "react_comment"    — someone reacted to (liked) the recipient's comment
 *
 * `userId` is the recipient; `actorId` is the user who triggered the event.
 * `shoutId` / `subjectUri` point at the relevant record so the UI can deep-link.
 */
const notifications = pgTable(
  "notifications",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    shoutId: text("shout_id").references(() => shouts.id),
    subjectUri: text("subject_uri"),
    read: boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  },
  (t) => [
    index("notifications_user_id_read_idx").on(t.userId, t.read),
    index("notifications_user_id_createdat_idx").on(t.userId, t.createdAt),
  ],
);

export type SelectNotification = InferSelectModel<typeof notifications>;
export type InsertNotification = InferInsertModel<typeof notifications>;

export default notifications;
