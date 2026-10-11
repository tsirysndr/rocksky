/** Start one item before resolving the rest; preserve order and stop stale work. */
export async function startProgressiveQueue<T, R>(
  items: readonly T[],
  actions: {
    current: () => boolean;
    resolve: (item: T) => Promise<R>;
    start: (item: R) => Promise<boolean>;
    append: (item: R) => Promise<boolean>;
    skipped: (items: T[]) => void;
  },
): Promise<{ background: Promise<void> }> {
  if (!items.length || !actions.current())
    return { background: Promise.resolve() };
  const first = await actions.resolve(items[0]);
  if (!actions.current()) return { background: Promise.resolve() };
  if (!(await actions.start(first))) {
    if (!actions.current()) return { background: Promise.resolve() };
    throw new Error("Could not start playback.");
  }
  const background = (async () => {
    const skipped: T[] = [];
    for (const item of items.slice(1)) {
      if (!actions.current()) return;
      try {
        const ready = await actions.resolve(item);
        if (!actions.current()) return;
        if (!(await actions.append(ready))) return;
      } catch {
        if (!actions.current()) return;
        skipped.push(item);
      }
    }
    if (skipped.length && actions.current()) actions.skipped(skipped);
  })();
  return { background };
}
