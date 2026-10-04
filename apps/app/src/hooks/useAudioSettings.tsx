import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
  type AudioSettings,
  type AudioSettingsPatch,
  getAudioSettings,
  loadLocalAudioSettings,
  putAudioSettings,
  saveLocalAudioSettings,
  toRemoteAudioSettings,
  withDefaults,
} from "../api/audioSettings";
import { authTokenAtom } from "../atoms/auth";
import { remoteCommandsAtom } from "../atoms/devices";
import { usePlaybackSource } from "./usePlaybackSource";

const QUERY_KEY = ["audio-settings"] as const;

type SectionKey = "equalizer" | "tone" | "crossfade" | "replayGain";

/**
 * The user's audio settings, from their atproto repo.
 *
 * The record (app.rocksky.rockbox.audio.settings) is the cross-device source of
 * truth, exactly as on web: a local copy is read first so the controls open on
 * the right values with no round-trip, then the record hydrates over it. No
 * record yet means a fresh user, so the defaults stand.
 */
export const useAudioSettingsQuery = (enabled = true) => {
  const queryClient = useQueryClient();
  const token = useAtomValue(authTokenAtom);
  const active = enabled && !!token;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void loadLocalAudioSettings().then((local) => {
      if (cancelled || !local) return;
      // Never clobber a record that has already arrived.
      queryClient.setQueryData<AudioSettings>(
        QUERY_KEY,
        (current) => current ?? local,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [active, queryClient]);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getAudioSettings,
    enabled: active,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Keep the local copy in step, so This Device still has these next launch.
  useEffect(() => {
    if (query.data) void saveLocalAudioSettings(query.data);
  }, [query.data]);

  return { ...query, settings: withDefaults(query.data ?? null) };
};

/**
 * Mount once, app-wide: loads the record as soon as there is a session rather
 * than waiting for the settings sheet to open.
 */
export const useAudioSettingsAutoLoad = () => {
  useAudioSettingsQuery(true);
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
 * The whole of each touched section, with defaults filling any gap.
 *
 * A record write replaces a section wholesale, so a sparse patch would drop
 * every field it didn't mention — nudging the precut would lose the bands.
 */
const fullSections = (
  settings: AudioSettings,
  keys: SectionKey[],
): AudioSettingsPatch => {
  const complete = withDefaults(settings);
  const out: AudioSettingsPatch = {};
  for (const key of keys) {
    if (key === "equalizer") out.equalizer = complete.equalizer;
    if (key === "tone") out.tone = complete.tone;
    if (key === "crossfade") out.crossfade = complete.crossfade;
    if (key === "replayGain") out.replayGain = complete.replayGain;
  }
  return out;
};

/**
 * Write a section of the settings record, and push it to the selected player.
 *
 * A knob fires continuously while it is dragged, so the cache is updated at
 * once — the control has to follow the finger — and both the record write and
 * the remote push are coalesced until the gesture settles.
 */
export const useAudioSettingsMutation = () => {
  const queryClient = useQueryClient();
  const commands = useAtomValue(remoteCommandsAtom);
  const { current } = usePlaybackSource();
  // A plain id keeps this stable across renders, unlike the derived object.
  const targetDeviceId = current?.kind === "device" ? current.id : null;
  const pending = useRef<AudioSettingsPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate } = useMutation({
    mutationFn: (patch: AudioSettingsPatch) => putAudioSettings(patch),
    onSuccess: (saved) => {
      // The server echoes the stored record, which is the authority on what was
      // actually accepted (it clamps), so take it rather than the local guess.
      queryClient.setQueryData<AudioSettings>(QUERY_KEY, saved);
      void saveLocalAudioSettings(saved);
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
    // The record first — it is what every player reads on its own schedule —
    // then the live push, so the selected device reacts now rather than on its
    // next sync. A player applies the sections it implements and ignores the
    // rest, which is why the document goes over verbatim.
    mutate(patch);
    if (targetDeviceId && commands) {
      commands.setAudioSettings(targetDeviceId, toRemoteAudioSettings(patch));
    }
  }, [commands, mutate, targetDeviceId]);

  const patch = useCallback(
    (next: AudioSettingsPatch) => {
      const merged = mergePatch(
        queryClient.getQueryData<AudioSettings>(QUERY_KEY),
        next,
      );
      queryClient.setQueryData<AudioSettings>(QUERY_KEY, merged);
      const sections = Object.keys(next) as SectionKey[];
      pending.current = {
        ...pending.current,
        ...fullSections(merged, sections),
      };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    },
    [queryClient, flush],
  );

  return { patch, flush };
};
