/** Throttle position saves and serialize writes so older snapshots cannot win. */
export function createQueueSnapshotWriter<T>(
  snapshot: () => T,
  write: (value: T) => Promise<void>,
  delayMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = Promise.resolve();
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const value = snapshot();
    const saved = pending.then(() => write(value));
    pending = saved.catch(() => {});
    return saved;
  };
  return {
    flush,
    schedule(onError: (error: unknown) => void) {
      // Frequent playback polls must not postpone the deadline indefinitely.
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void flush().catch(onError);
      }, delayMs);
    },
  };
}
