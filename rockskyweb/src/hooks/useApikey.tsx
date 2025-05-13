import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createApiKey,
  deleteApiKey,
  getApiKeys,
  updateApiKey,
} from "../api/apikeys";

export const useCreateApikeyMutation = () =>
  useMutation({
    mutationFn: ({
      name,
      description,
    }: {
      name: string;
      description?: string;
    }) => createApiKey(name, description),
  });

export const useApikeysQuery = (offset?: number, size?: number) =>
  useQuery({
    queryKey: ["apikeys", offset, size],
    queryFn: () => getApiKeys(offset, size),
    select: (response) => response.data,
  });

export const useDeleteApikeyMutation = () =>
  useMutation({
    mutationFn: deleteApiKey,
  });

export const useUpdateApikeyMutation = () =>
  useMutation({
    mutationFn: ({
      id,
      enabled,
      name,
      description,
    }: {
      id: string;
      enabled: boolean;
      name?: string;
      description?: string;
    }) => updateApiKey(id, enabled, name, description),
  });
