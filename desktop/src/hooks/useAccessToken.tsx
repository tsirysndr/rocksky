import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createAccessToken,
  deleteAccessToken,
  getAccessTokens,
} from "../api/access-tokens";

export const useAccessTokensQuery = (offset?: number, size?: number) =>
  useQuery({
    queryKey: ["access-tokens", offset, size],
    queryFn: () => getAccessTokens(offset, size),
    select: (response) => response.data,
  });

export const useCreateAccessTokenMutation = () =>
  useMutation({
    mutationFn: ({ name }: { name: string }) => createAccessToken(name),
  });

export const useDeleteAccessTokenMutation = () =>
  useMutation({
    mutationFn: deleteAccessToken,
  });
