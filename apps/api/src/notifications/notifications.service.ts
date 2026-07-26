import { consola } from "consola";
import type { Context } from "context";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import notifications, {
  type SelectNotification,
} from "../schema/notifications";
import shouts from "../schema/shouts";
import users from "../schema/users";

export type NotificationType =
  | "like_scrobble"
  | "follow"
  | "comment_scrobble"
  | "comment_profile"
  | "reply"
  | "react_comment";

export interface CreateNotificationParams {
  /** Recipient user id (users.xata_id). */
  userId?: string | null;
  /** User id of whoever triggered the event (users.xata_id). */
  actorId?: string | null;
  type: NotificationType;
  /** The shout involved, for comment/reply/react notifications. */
  shoutId?: string | null;
  /** at-uri of the subject (scrobble/song/profile), for deep-linking. */
  subjectUri?: string | null;
}

export interface NotificationActor {
  id: string;
  did: string;
  handle: string;
  displayName?: string;
  avatar: string;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  subjectUri?: string;
  shoutId?: string;
  shoutContent?: string;
  actor?: NotificationActor;
}

/**
 * NATS subject a given user's realtime notification stream is published on.
 * Every SSE connection subscribes to exactly this subject, so a message is
 * only delivered to the API instances holding that user's live connections —
 * this is what makes the fan-out horizontally scalable without websockets.
 */
export const notificationSubject = (userId: string) =>
  `rocksky.notification.${userId.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/**
 * Persist a notification and push it to the recipient's realtime stream.
 * No-ops when the actor is the recipient (you don't get notified about your
 * own actions) or when either party is missing. Never throws: notification
 * delivery must not break the underlying mutation (like/follow/shout).
 */
export async function createNotification(
  ctx: Context,
  params: CreateNotificationParams,
): Promise<SelectNotification | undefined> {
  try {
    const { userId, actorId, type, shoutId, subjectUri } = params;

    if (!userId || !actorId || userId === actorId) {
      return undefined;
    }

    const created = await ctx.db
      .insert(notifications)
      .values({
        userId,
        actorId,
        type,
        shoutId: shoutId ?? null,
        subjectUri: subjectUri ?? null,
      })
      .returning()
      .then((rows) => rows[0]);

    const unreadCount = await getUnreadCount(ctx, userId);
    const [view] = await hydrate(ctx, [created]);

    publish(ctx, userId, {
      type: "notification",
      notification: view,
      unreadCount,
    });

    return created;
  } catch (err) {
    consola.error("Failed to create notification", err);
    return undefined;
  }
}

export async function getUnreadCount(
  ctx: Context,
  userId: string,
): Promise<number> {
  const [row] = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.read, false)),
    );
  return row?.count ?? 0;
}

export async function listNotifications(
  ctx: Context,
  userId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ notifications: NotificationView[]; cursor?: string }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);

  const rows = await ctx.db
    .select()
    .from(notifications)
    .where(
      opts.cursor
        ? and(
            eq(notifications.userId, userId),
            lt(notifications.createdAt, new Date(opts.cursor)),
          )
        : eq(notifications.userId, userId),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const views = await hydrate(ctx, page);

  return {
    notifications: views,
    cursor: hasMore ? page[page.length - 1].createdAt.toISOString() : undefined,
  };
}

/**
 * Mark notifications as read/viewed. With no ids, marks the whole inbox.
 * Returns the recipient's new unread count and pushes it to their stream so
 * every open tab clears its badge.
 */
export async function markSeen(
  ctx: Context,
  userId: string,
  ids?: string[],
): Promise<number> {
  const base = and(
    eq(notifications.userId, userId),
    eq(notifications.read, false),
  );

  await ctx.db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(ids?.length ? and(base, inArray(notifications.id, ids)) : base);

  const unreadCount = await getUnreadCount(ctx, userId);
  publish(ctx, userId, { type: "seen", unreadCount });
  return unreadCount;
}

async function hydrate(
  ctx: Context,
  rows: SelectNotification[],
): Promise<NotificationView[]> {
  if (!rows.length) return [];

  const actorIds = [...new Set(rows.map((r) => r.actorId))];
  const shoutIds = [
    ...new Set(rows.map((r) => r.shoutId).filter((v): v is string => !!v)),
  ];

  const actors = await ctx.db
    .select()
    .from(users)
    .where(inArray(users.id, actorIds));
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const shoutById = new Map<string, string>();
  if (shoutIds.length) {
    const shoutRows = await ctx.db
      .select({ id: shouts.id, content: shouts.content })
      .from(shouts)
      .where(inArray(shouts.id, shoutIds));
    for (const s of shoutRows) shoutById.set(s.id, s.content);
  }

  return rows.map((r) => {
    const actor = actorById.get(r.actorId);
    return {
      id: r.id,
      type: r.type as NotificationType,
      read: r.read,
      createdAt: r.createdAt.toISOString(),
      subjectUri: r.subjectUri ?? undefined,
      shoutId: r.shoutId ?? undefined,
      shoutContent: r.shoutId
        ? (shoutById.get(r.shoutId) ?? undefined)
        : undefined,
      actor: actor
        ? {
            id: actor.id,
            did: actor.did,
            handle: actor.handle,
            displayName: actor.displayName ?? undefined,
            avatar: actor.avatar,
          }
        : undefined,
    };
  });
}

function publish(ctx: Context, userId: string, payload: unknown): void {
  try {
    ctx.nc.publish(
      notificationSubject(userId),
      Buffer.from(JSON.stringify(payload)),
    );
  } catch (err) {
    consola.error("Failed to publish notification event", err);
  }
}
