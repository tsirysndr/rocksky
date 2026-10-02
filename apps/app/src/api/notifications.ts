import { storage } from "../storage";
import { client } from ".";

const authHeader = () => ({ Authorization: `Bearer ${storage.getToken()}` });

export type NotificationType =
  | "like_scrobble"
  | "follow"
  | "comment_scrobble"
  | "comment_profile"
  | "reply"
  | "react_comment"
  | "mention"
  | (string & {});

export interface NotificationActor {
  id?: string;
  did?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
}

export interface NotificationSubject {
  uri?: string;
  title?: string;
  artist?: string;
  albumArt?: string;
}

export interface Notification {
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

export interface ListNotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  cursor?: string;
}

export interface UnreadCountResponse {
  count: number;
}

export interface UpdateSeenResponse {
  unreadCount: number;
}

export const listNotifications = async ({
  limit = 30,
  cursor,
}: {
  limit?: number;
  cursor?: string;
} = {}): Promise<ListNotificationsResponse> => {
  const response = await client.get<ListNotificationsResponse>(
    "/xrpc/app.rocksky.notification.listNotifications",
    {
      params: cursor ? { limit, cursor } : { limit },
      headers: authHeader(),
    },
  );
  return response.data;
};

export const getUnreadCount = async (): Promise<UnreadCountResponse> => {
  const response = await client.get<UnreadCountResponse>(
    "/xrpc/app.rocksky.notification.getUnreadCount",
    { headers: authHeader() },
  );
  return response.data;
};

export const updateSeen = async (
  ids?: string[],
): Promise<UpdateSeenResponse> => {
  const response = await client.post<UpdateSeenResponse>(
    "/xrpc/app.rocksky.notification.updateSeen",
    ids && ids.length > 0 ? { ids } : {},
    { headers: { "Content-Type": "application/json", ...authHeader() } },
  );
  return response.data;
};

const GROUPABLE_TYPES = new Set<NotificationType>([
  "like_scrobble",
  "follow",
  "react_comment",
]);

export interface NotificationGroup {
  key: string;
  type: NotificationType;
  latest: Notification;
  actors: NotificationActor[];
  count: number;
}

export function groupNotifications(
  notifications: Notification[],
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const byKey = new Map<string, NotificationGroup>();

  for (const notification of notifications) {
    if (!GROUPABLE_TYPES.has(notification.type)) {
      groups.push({
        key: `${notification.type}::${notification.id}`,
        type: notification.type,
        latest: notification,
        actors: notification.actor ? [notification.actor] : [],
        count: 1,
      });
      continue;
    }

    const key = `${notification.type}::${notification.shoutId ?? notification.subjectUri ?? ""}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        type: notification.type,
        latest: notification,
        actors: [],
        count: 0,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.count += 1;

    const actor = notification.actor;
    if (actor) {
      const actorKey = actor.did ?? actor.id ?? actor.handle;
      if (!group.actors.some((a) => (a.did ?? a.id ?? a.handle) === actorKey)) {
        group.actors.push(actor);
      }
    }
  }

  return groups;
}
