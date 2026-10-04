import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { engineCommand, isEngineAvailable } from "../../modules/rocksky-engine";
import {
  type AudioSettings,
  type AudioSettingsPatch,
  getAudioSettings,
  hasNoSettings,
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

/**
 * How long a change waits before it is written, matching web's lexicon
 * debounce. A drag or a held stepper produces a stream of values; only the one
 * the user settles on needs to reach the record, and each write is a PDS
 * putRecord.
 */
const WRITE_DEBOUNCE_MS = 800;

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
      if (cancelled || !local || hasNoSettings(local)) return;
      // Never clobber a record that has already arrived — but an empty answer
      // isn't one, so the stored curve still wins over it.
      queryClient.setQueryData<AudioSettings>(QUERY_KEY, (current) =>
        current && !hasNoSettings(current) ? current : local,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [active, queryClient]);

  const query = useQuery({
    queryKey: QUERY_KEY,
    // The record wins when there is one; otherwise the local copy stands, so a
    // repo the server could not read (it answers 200 with nothing) never
    // flattens a curve the user actually has.
    queryFn: async () =>
      (await getAudioSettings()) ?? (await loadLocalAudioSettings()),
    enabled: active,
    // Hydrated once per session, as web hydrates once per did. A later refetch
    // resolving mid-gesture would answer with the pre-edit record and snap the
    // control the user is still holding back to its old value; after load, the
    // cache is updated by the writes themselves and by the server's echo.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Keep the local copy in step, so This Device still has these next launch —
  // but never persist an empty answer over a good one.
  useEffect(() => {
    if (query.data && !hasNoSettings(query.data)) {
      void saveLocalAudioSettings(query.data);
    }
  }, [query.data]);

  return { ...query, settings: withDefaults(query.data ?? null) };
};

/**
 * Mount once, app-wide: loads the record as soon as there is a session rather
 * than waiting for the settings sheet to open.
 */
export const useAudioSettingsAutoLoad = () => {
  const { data } = useAudioSettingsQuery(true);
  useEffect(() => {
    if (!data || !isEngineAvailable()) return;
    const result = engineCommand({
      cmd: "setAudioSettings",
      settings: toRemoteAudioSettings(withDefaults(data)),
    });
    if (!result.ok)
      console.warn("Could not apply audio settings:", result.error);
  }, [data]);
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
  // One write at a time: the record is written with `swapRecord`, so two
  // overlapping writes make the second one lose on a stale cid — and a lost
  // write came back as an empty view, which used to flatten the sliders.
  const inFlight = useRef(false);
  const flushRef = useRef<() => void>(() => {});

  const { mutate } = useMutation({
    mutationFn: (patch: AudioSettingsPatch) => putAudioSettings(patch),
    onSuccess: (saved) => {
      // The echo is the authority on what was accepted (the server clamps) —
      // unless it carries nothing, which is how this endpoint reports *any*
      // failure: unauthorized, no agent, a swapRecord conflict, a timeout. All
      // of those answer 200 with `{ createdAt }`, and taking that literally is
      // what reset every slider the moment it was released.
      if (hasNoSettings(saved)) return;
      const latest = mergePatch(saved, pending.current);
      queryClient.setQueryData<AudioSettings>(QUERY_KEY, latest);
      void saveLocalAudioSettings(latest);
    },
    // Deliberately no invalidate on error: the optimistic value is the user's
    // intent, and a refetch would answer with the unchanged record (or nothing)
    // and throw their edit away.
  });

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (Object.keys(pending.current).length === 0) return;
    // Hold it back until the write in flight settles; it is sent then, with
    // whatever else has accumulated in the meantime.
    if (inFlight.current) return;
    const patch = pending.current;
    pending.current = {};
    inFlight.current = true;
    // The record first — it is what every player reads on its own schedule —
    // then the live push, so the selected device reacts now rather than on its
    // next sync. A player applies the sections it implements and ignores the
    // rest, which is why the document goes over verbatim.
    mutate(patch, {
      onSettled: () => {
        inFlight.current = false;
        if (Object.keys(pending.current).length > 0) flushRef.current();
      },
    });
    if (targetDeviceId && commands) {
      commands.setAudioSettings(targetDeviceId, toRemoteAudioSettings(patch));
    }
  }, [commands, mutate, targetDeviceId]);

  flushRef.current = flush;

  // A change made and then abandoned — the sheet closed within the debounce —
  // still has to reach the record. The call goes direct rather than through the
  // mutation, which is gone along with the component.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const unsent = pending.current;
      pending.current = {};
      if (Object.keys(unsent).length === 0) return;
      void putAudioSettings(unsent).catch(() => {});
    },
    [],
  );

  const patch = useCallback(
    (next: AudioSettingsPatch) => {
      // A fetch still in flight would resolve over the edit that is being made
      // right now — the standard optimistic-update hazard — so it is cancelled
      // before the local write.
      void queryClient.cancelQueries({ queryKey: QUERY_KEY });
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
      timer.current = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    [queryClient, flush],
  );

  return { patch, flush };
};
