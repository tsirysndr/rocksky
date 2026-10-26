import { useMutation, useQueryClient } from "@tanstack/react-query";
import { like, unlike, likeTrackById, unlikeTrackById } from "../api/likes";
import { isLikeQuery } from "../../../shared/likeQueries";

// Keep every surface in sync after the server has committed the change.
// invalidateQueries refetches mounted views in the background and marks other
// cached views stale so navigating back to them loads fresh data.
const useLikeAction = (action: (id: string) => Promise<unknown>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => isLikeQuery(query.queryKey),
      });
    },
  });
};

export const useLikeMutation = () => useLikeAction(like);
export const useUnlikeMutation = () => useLikeAction(unlike);

const useLike = () => {
  const likeMutation = useLikeMutation();
  const unlikeMutation = useUnlikeMutation();
  const likeTrackMutation = useLikeAction(likeTrackById);
  const unlikeTrackMutation = useLikeAction(unlikeTrackById);
  return {
    like: likeMutation.mutateAsync,
    unlike: unlikeMutation.mutateAsync,
    likeTrackById: likeTrackMutation.mutateAsync,
    unlikeTrackById: unlikeTrackMutation.mutateAsync,
  };
};

export default useLike;
