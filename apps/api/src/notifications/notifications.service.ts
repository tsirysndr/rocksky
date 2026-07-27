import { consola } from "consola";
import type { Context } from "context";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { withFallbackAlbumArt } from "../lib";
import albums from "../schema/albums";
import notifications, {
  type SelectNotification,
} from "../schema/notifications";
import scrobbles from "../schema/scrobbles";
import shouts from "../schema/shouts";
import tracks from "../schema/tracks";
import users from "../schema/users";

export type NotificationType =
  | "like_scrobble"
  | "follow"
  | "comment_scrobble"
  | "comment_profile"
  | "reply"
  | "react_comment"
  | "mention";

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

/** The song/album behind a notification's subjectUri, for rich display. */
export interface NotificationSubject {
  uri: string;
  title?: string;
  artist?: string;
  albumArt?: string;
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
  subject?: NotificationSubject;
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

  const subjectByUri = await resolveSubjects(ctx, rows);

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
      subject: r.subjectUri ? subjectByUri.get(r.subjectUri) : undefined,
    };
  });
}

/**
 * Resolve the track/album behind each notification's subjectUri so the client
 * can show album art + title/artist without an extra round-trip. Batched by
 * collection: scrobble URIs join through to their track; song/album URIs hit
 * their own table. Profile / bare-did subjects (follows, profile comments)
 * have nothing to show and are simply absent from the map.
 */
async function resolveSubjects(
  ctx: Context,
  rows: SelectNotification[],
): Promise<Map<string, NotificationSubject>> {
  const byUri = new Map<string, NotificationSubject>();
  const uris = [
    ...new Set(rows.map((r) => r.subjectUri).filter((v): v is string => !!v)),
  ];
  if (!uris.length) return byUri;

  const scrobbleUris = uris.filter((u) => u.includes("app.rocksky.scrobble"));
  const songUris = uris.filter((u) => u.includes("app.rocksky.song"));
  const albumUris = uris.filter((u) => u.includes("app.rocksky.album"));

  if (scrobbleUris.length) {
    const scrobbleRows = await ctx.db
      .select({
        uri: scrobbles.uri,
        title: tracks.title,
        artist: tracks.artist,
        albumArt: tracks.albumArt,
      })
      .from(scrobbles)
      .leftJoin(tracks, eq(scrobbles.trackId, tracks.id))
      .where(inArray(scrobbles.uri, scrobbleUris));
    for (const s of scrobbleRows) {
      if (!s.uri) continue;
      byUri.set(s.uri, {
        uri: s.uri,
        title: s.title ?? undefined,
        artist: s.artist ?? undefined,
        albumArt: withFallbackAlbumArt(s.albumArt),
      });
    }
  }

  if (songUris.length) {
    const songRows = await ctx.db
      .select({
        uri: tracks.uri,
        title: tracks.title,
        artist: tracks.artist,
        albumArt: tracks.albumArt,
      })
      .from(tracks)
      .where(inArray(tracks.uri, songUris));
    for (const t of songRows) {
      if (!t.uri) continue;
      byUri.set(t.uri, {
        uri: t.uri,
        title: t.title ?? undefined,
        artist: t.artist ?? undefined,
        albumArt: withFallbackAlbumArt(t.albumArt),
      });
    }
  }

  if (albumUris.length) {
    const albumRows = await ctx.db
      .select({
        uri: albums.uri,
        title: albums.title,
        artist: albums.artist,
        albumArt: albums.albumArt,
      })
      .from(albums)
      .where(inArray(albums.uri, albumUris));
    for (const a of albumRows) {
      if (!a.uri) continue;
      byUri.set(a.uri, {
        uri: a.uri,
        title: a.title ?? undefined,
        artist: a.artist ?? undefined,
        albumArt: withFallbackAlbumArt(a.albumArt),
      });
    }
  }

  return byUri;
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
