import type {
  ListNotificationsOutput,
  NotificationActor,
  NotificationSubjectView,
  NotificationView as LexNotificationView,
} from "@rocksky/sdk";
import { rocksky } from "../lib/rocksky";

export type { NotificationActor };

export type NotificationType =
  | "like_scrobble"
  | "follow"
  | "comment_scrobble"
  | "comment_profile"
  | "reply"
  | "react_comment"
  | "mention";

/** The song/album behind a notification's subjectUri, for rich display. */
export type NotificationSubject = NotificationSubjectView;

/** The lexicon notification view, with `type` narrowed to the values the
 * server actually emits. */
export interface NotificationView extends Omit<LexNotificationView, "type"> {
  type: NotificationType;
}

export interface NotificationList
  extends Omit<ListNotificationsOutput, "notifications"> {
  notifications: NotificationView[];
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
  const response = await rocksky().unreadCount();
  return response?.count ?? 0;
};

export const listNotifications = async (
  cursor?: string,
): Promise<NotificationList> => {
  const response = await rocksky().notifications(30, cursor);
  return response as NotificationList;
};

/** Mark notifications as viewed. Omit `ids` to mark the whole inbox. */
export const markNotificationsSeen = async (
  ids?: string[],
): Promise<number> => {
  const response = await rocksky().updateSeen(ids);
  return response?.unreadCount ?? 0;
};
