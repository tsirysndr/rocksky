export type PlaybackModes = {
  shuffle: boolean;
  repeat: "off" | "one" | "all";
};

export function parsePlaybackModes(raw: string | null): PlaybackModes {
  let value: Partial<PlaybackModes> | null = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {}
  return {
    shuffle: value?.shuffle === true,
    repeat:
      value?.repeat === "one" || value?.repeat === "all" ? value.repeat : "off",
  };
}

/** Device preferences survive queue replacement/clearing and serialize writes. */
export function createLocalPlaybackModes(
  read: () => Promise<string | null>,
  write: (raw: string) => Promise<void>,
  changed: (modes: PlaybackModes, patch: Partial<PlaybackModes>) => void,
) {
  let modes: PlaybackModes = { shuffle: false, repeat: "off" };
  let loading: Promise<PlaybackModes> | null = null;
  let pending = Promise.resolve();
  const load = () => {
    if (!loading)
      loading = read()
        .then((raw) => {
          modes = parsePlaybackModes(raw);
          return modes;
        })
        .catch((error) => {
          loading = null;
          throw error;
        });
    return loading;
  };
  return {
    get: () => modes,
    load,
    async set(patch: Partial<PlaybackModes>) {
      await load();
      modes = { ...modes, ...patch };
      changed(modes, patch);
      const raw = JSON.stringify(modes);
      const saved = pending.then(() => write(raw));
      pending = saved.catch(() => {});
      await saved;
    },
  };
}
