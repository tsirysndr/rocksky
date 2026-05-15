import { useMutation } from "@tanstack/react-query";
import { like, unlike } from "../api/likes";

export const useLikeMutation = () => useMutation({ mutationFn: like });
export const useUnlikeMutation = () => useMutation({ mutationFn: unlike });

const useLike = () => {
  const { mutate: likeMutate } = useLikeMutation();
  const { mutate: unlikeMutate } = useUnlikeMutation();
  return {
    like: (uri: string) => likeMutate(uri),
    unlike: (uri: string) => unlikeMutate(uri),
  };
};

export default useLike;
