/** Bound native/network work while retaining the caller's queue order. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  work: (item: T, index: number) => Promise<R>,
  concurrency = 6,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index], index);
      }
    }),
  );
  return results;
}
