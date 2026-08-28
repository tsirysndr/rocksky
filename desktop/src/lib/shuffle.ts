// Fisher-Yates, because the obvious one-liner isn't a shuffle.
//
// Sorting on a random comparator gives an inconsistent ordering, which sort
// algorithms are entitled to assume never happens. V8's TimSort makes
// only O(n log n) comparisons, so most elements never get compared and land
// near where they started — on a playlist that reads as "shuffle barely did
// anything". Fisher-Yates visits every position and is uniform.

/** A uniformly shuffled copy. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Shuffled, but with the track at `startIndex` kept at the head.
 *
 * Picking a track with shuffle on should still play *that* track — shuffle
 * governs what comes after it, not what you just clicked.
 */
export function shuffledFrom<T>(items: readonly T[], startIndex: number): T[] {
  if (startIndex < 0 || startIndex >= items.length) return shuffled(items);
  const rest = items.filter((_, i) => i !== startIndex);
  return [items[startIndex], ...shuffled(rest)];
}
