import { rocksky } from "../lib/rocksky";

export interface NotificationActor {
  id?: string;
  did?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
}

export type NotificationType =
  | "like_scrobble"
  | "follow"
  | "comment_scrobble"
  | "comment_profile"
  | "reply"
  | "react_comment"
  | "mention";

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

export interface NotificationList {
  notifications: NotificationView[];
  unreadCount: number;
  cursor?: string;
}

/** A run of notifications collapsed into one row (Bluesky-style). */
export interface NotificationGroup {
  key: string;
  type: NotificationType;
  /** Distinct actors, most recent first. */
  actors: NotificationActor[];
  /** The most recent notification in the group — drives subject/date/target. */
  latest: NotificationView;
}

/**
 * Types whose events pile up on a single subject with generic wording, so
 * many actors read naturally as one row ("A, B and 3 others liked your
 * scrobble"). Everything else (comments, replies, mentions) carries unique
 * text and stays its own row.
 */
const GROUPABLE = new Set<NotificationType>([
  "like_scrobble",
  "follow",
  "react_comment",
]);

const actorKey = (a?: NotificationActor): string =>
  a?.did ?? a?.id ?? a?.handle ?? "";

/**
 * Collapse a most-recent-first notification list into display groups. Grouped
 * types merge by their subject (the reacted comment, the liked scrobble, or —
 * for follows — the recipient); each group keeps its newest event as the
 * representative and its actors deduped in recency order.
 */
export function groupNotifications(
  notifications: NotificationView[],
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const byKey = new Map<string, NotificationGroup>();

  for (const n of notifications) {
    const key = GROUPABLE.has(n.type)
      ? `${n.type}::${n.shoutId ?? n.subjectUri ?? ""}`
      : `id::${n.id}`;

    let group = byKey.get(key);
    if (!group) {
      group = { key, type: n.type, actors: [], latest: n };
      byKey.set(key, group);
      groups.push(group);
    }

    if (n.actor && !group.actors.some((a) => actorKey(a) === actorKey(n.actor))) {
      group.actors.push(n.actor);
    }
  }

  return groups;
}

export const getUnreadCount = async (): Promise<number> => {
  const data = await rocksky().unreadCount();
  return data?.count ?? 0;
};

export const listNotifications = async (
  cursor?: string,
): Promise<NotificationList> => {
  const data = await rocksky().notifications(30, cursor);
  return data as unknown as NotificationList;
};

/** Mark notifications as viewed. Omit `ids` to mark the whole inbox. */
export const markNotificationsSeen = async (
  ids?: string[],
): Promise<number> => {
  const data = await rocksky().updateSeen(ids);
  return data?.unreadCount ?? 0;
};
