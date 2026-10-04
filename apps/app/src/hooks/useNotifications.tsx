import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import {
  getUnreadCount,
  listNotifications,
  type UnreadCountResponse,
  updateSeen,
} from "../api/notifications";
import { authTokenAtom } from "../atoms/auth";

export const useNotificationsQuery = () => {
  const token = useAtomValue(authTokenAtom);
  return useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => listNotifications(),
    enabled: !!token,
  });
};

export const useUnreadCountQuery = () => {
  const token = useAtomValue(authTokenAtom);
  return useQuery({
    queryKey: ["notifications", "unreadCount"],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    enabled: !!token,
  });
};

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
