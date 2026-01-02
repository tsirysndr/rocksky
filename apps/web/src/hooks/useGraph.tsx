import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFollowers,
  getFollows,
  followAccount,
  unfollowAccount,
} from "../api/graph";

export const useFollowsQuery = (
  actor: string,
  limit: number,
  cursor?: string,
) =>
  useQuery({
    queryKey: ["follows", actor, limit, cursor],
    queryFn: () => getFollows(actor, limit, cursor),
  });

export const useFollowersQuery = (
  actor: string,
  limit: number,
  cursor?: string,
) =>
  useQuery({
    queryKey: ["followers", actor, limit, cursor],
    queryFn: () => getFollowers(actor, limit, cursor),
  });

export const useFollowAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: followAccount,
    onSuccess: (_data, account) => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["followers", account] });
    },
  });
};

export const useUnfollowAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unfollowAccount,
    onSuccess: (_data, account) => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["followers", account] });
    },
  });
};
