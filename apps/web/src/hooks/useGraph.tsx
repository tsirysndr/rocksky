import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getFollowers,
  getFollows,
  followAccount,
  unfollowAccount,
} from "../api/graph";

export const useFollowsQuery = (
  actor: string,
  limit: number,
  dids?: string[],
  cursor?: string,
) =>
  useQuery({
    queryKey: ["follows", actor, limit, dids, cursor],
    queryFn: () => getFollows(actor, limit, dids, cursor),
  });

export const useFollowsInfiniteQuery = (
  actor: string,
  limit: number,
  dids?: string[],
) =>
  useInfiniteQuery({
    queryKey: ["follows-infinite", actor, dids, limit],
    queryFn: ({ pageParam }) => getFollows(actor, limit, dids, pageParam),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
  });

export const useFollowersQuery = (
  actor: string,
  limit: number,
  dids?: string[],
  cursor?: string,
) =>
  useQuery({
    queryKey: ["followers", actor, limit, dids, cursor],
    queryFn: () => getFollowers(actor, limit, dids, cursor),
  });

export const useFollowersInfiniteQuery = (
  actor: string,
  limit: number,
  dids?: string[],
) =>
  useInfiniteQuery({
    queryKey: ["followers-infinite", actor, limit, dids],
    queryFn: ({ pageParam }) => getFollowers(actor, limit, dids, pageParam),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
  });

export const useFollowAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: followAccount,
    onSuccess: (_data, account) => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["followers", account] });
      queryClient.invalidateQueries({
        queryKey: ["follows-infinite"],
      });
      queryClient.invalidateQueries({
        queryKey: ["followers-infinite"],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["follows-infinite"],
      });
      queryClient.invalidateQueries({
        queryKey: ["followers-infinite"],
      });
    },
  });
};
