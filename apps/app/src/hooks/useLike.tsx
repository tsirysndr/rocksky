import { useMutation, useQuery } from "@tanstack/react-query";
import { getLikes, like, unlike } from "../api/likes";

export const useLikeMutation = () =>
  useMutation({
    mutationFn: like,
  });

export const useUnlikeMutation = () =>
  useMutation({
    mutationFn: unlike,
  });

export const useLikesQuery = (uri: string) =>
  useQuery({
    queryKey: ["likes", uri],
    queryFn: () => getLikes(uri),
    enabled: !!uri,
  });

const useLike = () => ({ like, unlike, getLikes });

export default useLike;
