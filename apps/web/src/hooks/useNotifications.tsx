import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getUnreadCount,
  listNotifications,
  markNotificationsSeen,
} from "../api/notifications";
import { API_URL } from "../consts";

const UNREAD_KEY = ["notifications", "unreadCount"];
const LIST_KEY = ["notifications", "list"];

export const useUnreadCountQuery = () =>
  useQuery({
    queryKey: UNREAD_KEY,
    queryFn: getUnreadCount,
    enabled: !!localStorage.getItem("token"),
  });

export const useNotificationListQuery = (enabled: boolean) =>
  useQuery({
    queryKey: LIST_KEY,
    queryFn: () => listNotifications(),
    enabled,
  });

export const useMarkSeenMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => markNotificationsSeen(ids),
    onSuccess: (unreadCount) => {
      queryClient.setQueryData(UNREAD_KEY, unreadCount);
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
};

/**
 * Subscribes to the notifications SSE stream and keeps the react-query caches
 * in sync. The browser's EventSource auto-reconnects on transient errors.
 */
export const useNotificationStream = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const setCount = (n: number) =>
      queryClient.setQueryData(UNREAD_KEY, n);

    const es = new EventSource(
      `${API_URL}/notifications/stream?token=${encodeURIComponent(token)}`,
    );

    const onCount = (e: MessageEvent) => {
      try {
        setCount(JSON.parse(e.data).unreadCount);
      } catch {
        // ignore malformed payloads
      }
    };

    es.addEventListener("unread", onCount as EventListener);
    es.addEventListener("seen", onCount as EventListener);
    es.addEventListener("notification", ((e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (typeof payload.unreadCount === "number") {
          setCount(payload.unreadCount);
        }
      } catch {
        // ignore
      }
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    }) as EventListener);

    return () => es.close();
  }, [queryClient]);
};
