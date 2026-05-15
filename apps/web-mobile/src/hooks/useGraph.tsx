import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  followAccount,
  getFollowers,
  getFollows,
  unfollowAccount,
} from "../api/graph";

export const useFollowsInfiniteQuery = (actor: string, limit: number) =>
  useInfiniteQuery({
    queryKey: ["follows-infinite", actor, limit],
    queryFn: ({ pageParam }) => getFollows(actor, limit, undefined, pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!actor,
  });

export const useFollowsQuery = (
  actor: string,
  limit: number,
  dids?: string[],
) =>
  useQuery({
    queryKey: ["follows", actor, limit, dids],
    queryFn: () => getFollows(actor, limit, dids),
    enabled: !!actor && !!dids && dids.length > 0,
  });

export const useFollowersQuery = (
  actor: string | undefined,
  limit: number,
  dids?: string[],
) =>
  useQuery({
    queryKey: ["followers", actor, limit, dids],
    queryFn: () => getFollowers(actor!, limit, dids),
    enabled: !!actor,
  });

export const useFollowersInfiniteQuery = (actor: string, limit: number) =>
  useInfiniteQuery({
    queryKey: ["followers-infinite", actor, limit],
    queryFn: ({ pageParam }) => getFollowers(actor, limit, undefined, pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!actor,
  });

export const useFollowAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: followAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["followers"] });
    },
  });
};

export const useUnfollowAccountMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unfollowAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["followers"] });
    },
  });
};
