import { client } from ".";

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

export interface NotificationList {
  notifications: NotificationView[];
  unreadCount: number;
  cursor?: string;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getUnreadCount = async (): Promise<number> => {
  const response = await client.get(
    "/xrpc/app.rocksky.notification.getUnreadCount",
    { headers: authHeaders() },
  );
  return response.data?.count ?? 0;
};

export const listNotifications = async (
  cursor?: string,
): Promise<NotificationList> => {
  const response = await client.get(
    "/xrpc/app.rocksky.notification.listNotifications",
    {
      params: { limit: 30, ...(cursor ? { cursor } : {}) },
      headers: authHeaders(),
    },
  );
  return response.data;
};

/** Mark notifications as viewed. Omit `ids` to mark the whole inbox. */
export const markNotificationsSeen = async (
  ids?: string[],
): Promise<number> => {
  const response = await client.post(
    "/xrpc/app.rocksky.notification.updateSeen",
    ids?.length ? { ids } : {},
    { headers: authHeaders() },
  );
  return response.data?.unreadCount ?? 0;
};
