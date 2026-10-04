import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import {
  deleteEqualizerPreset,
  type EqualizerPreset,
  listEqualizerPresets,
  type PutPresetInput,
  saveEqualizerPreset,
} from "../api/equalizerPresets";
import { authTokenAtom } from "../atoms/auth";

const QUERY_KEY = ["equalizer", "presets"] as const;

export const useEqualizerPresetsQuery = (enabled = true) => {
  const token = useAtomValue(authTokenAtom);
  return useQuery<EqualizerPreset[]>({
    queryKey: QUERY_KEY,
    queryFn: listEqualizerPresets,
    enabled: enabled && !!token,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

export const useSaveEqualizerPresetMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PutPresetInput) => saveEqualizerPreset(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};

export const useDeleteEqualizerPresetMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rkey: string) => deleteEqualizerPreset(rkey),
    // The row is dropped at once; the list is refetched either way, since a
    // failure means it is still there.
    onMutate: async (rkey) => {
      queryClient.setQueryData<EqualizerPreset[]>(QUERY_KEY, (current) =>
        (current ?? []).filter((preset) => preset.rkey !== rkey),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};
