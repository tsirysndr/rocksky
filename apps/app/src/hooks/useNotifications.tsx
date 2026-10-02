import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUnreadCount,
  listNotifications,
  type UnreadCountResponse,
  updateSeen,
} from "../api/notifications";
import { storage } from "../storage";

export const useNotificationsQuery = () =>
  useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => listNotifications(),
    enabled: !!storage.getToken(),
  });

export const useUnreadCountQuery = () =>
  useQuery({
    queryKey: ["notifications", "unreadCount"],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    enabled: !!storage.getToken(),
  });

export const useMarkSeenMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => updateSeen(ids),
    onSuccess: (data) => {
      queryClient.setQueryData<UnreadCountResponse>(
        ["notifications", "unreadCount"],
        { count: data.unreadCount },
      );
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    },
  });
};
