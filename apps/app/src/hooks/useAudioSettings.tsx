import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import {
  type AudioSettings,
  type AudioSettingsPatch,
  getAudioSettings,
  putAudioSettings,
  withDefaults,
} from "../api/audioSettings";

const QUERY_KEY = ["audio-settings"] as const;

export const useAudioSettingsQuery = (enabled = true) => {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getAudioSettings,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  return { ...query, settings: withDefaults(query.data ?? null) };
};

const mergePatch = (
  current: AudioSettings | null | undefined,
  patch: AudioSettingsPatch,
): AudioSettings => ({
  ...current,
  ...(patch.equalizer
    ? { equalizer: { ...current?.equalizer, ...patch.equalizer } }
    : {}),
  ...(patch.tone ? { tone: { ...current?.tone, ...patch.tone } } : {}),
  ...(patch.crossfade
    ? { crossfade: { ...current?.crossfade, ...patch.crossfade } }
    : {}),
  ...(patch.replayGain
    ? { replayGain: { ...current?.replayGain, ...patch.replayGain } }
    : {}),
});

/**
 * Write a section of the settings record.
 *
 * A knob fires continuously while it is dragged, so the cache is updated at
 * once — the control has to follow the finger — and the write is coalesced and
 * sent after the gesture settles. Patches are merged, so dragging one knob
 * never reverts another.
 */
export const useAudioSettingsMutation = () => {
  const queryClient = useQueryClient();
  const pending = useRef<AudioSettingsPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate } = useMutation({
    mutationFn: (patch: AudioSettingsPatch) => putAudioSettings(patch),
    onSuccess: (saved) => {
      // The server echoes the stored record, which is the authority on what was
      // actually accepted (it clamps), so take it rather than the local guess.
      queryClient.setQueryData<AudioSettings>(QUERY_KEY, saved);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    mutate(patch);
  }, [mutate]);

  const patch = useCallback(
    (next: AudioSettingsPatch) => {
      queryClient.setQueryData<AudioSettings>(QUERY_KEY, (current) =>
        mergePatch(current, next),
      );
      pending.current = mergePatch(
        pending.current as AudioSettings,
        next,
      ) as AudioSettingsPatch;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    },
    [queryClient, flush],
  );

  return { patch, flush };
};
