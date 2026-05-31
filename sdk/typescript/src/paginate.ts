export type PageOpts = {
  limit: number;
  offset: number;
  cursor?: string;
};

export type PageResult<T> = {
  items: T[];
  cursor?: string;
};

export type PaginateArgs<T> = {
  /**
   * Fetch one page. Return either:
   *   - an array of items (offset/limit mode — pagination stops when an empty
   *     page or a short page comes back), or
   *   - a `{ items, cursor }` object (cursor mode — pagination stops when
   *     `cursor` is missing/null).
   */
  fetch: (opts: PageOpts) => Promise<PageResult<T> | T[]>;
  pageSize?: number;
  maxItems?: number;
  signal?: AbortSignal;
};

/**
 * Page through an XRPC endpoint as an async iterable.
 *
 *   for await (const s of paginate({
 *     fetch: ({ limit, offset }) =>
 *       client.actor.getActorScrobbles({ did, limit, offset }),
 *     pageSize: 50,
 *   })) {
 *     console.log(s.track.title);
 *   }
 */
export function paginate<T>(args: PaginateArgs<T>): AsyncIterable<T> & {
  /** Collect every item into an array — convenience for small result sets. */
  toArray(): Promise<T[]>;
} {
  const pageSize = args.pageSize ?? 50;
  const maxItems = args.maxItems ?? Number.POSITIVE_INFINITY;

  async function* iter(): AsyncGenerator<T> {
    let offset = 0;
    let cursor: string | undefined;
    let yielded = 0;
    while (yielded < maxItems) {
      checkAbort(args.signal);
      const result = await args.fetch({ limit: pageSize, offset, cursor });
      checkAbort(args.signal);
      const { items, nextCursor } = normalize(result);
      if (items.length === 0) return;
      for (const item of items) {
        if (yielded >= maxItems) return;
        yield item;
        yielded++;
      }
      offset += items.length;
      if (nextCursor !== undefined) {
        if (nextCursor === cursor || nextCursor === null) return;
        cursor = nextCursor ?? undefined;
      } else if (items.length < pageSize) {
        return;
      }
    }
  }

  const iterable: AsyncIterable<T> = { [Symbol.asyncIterator]: iter };
  return Object.assign(iterable, {
    async toArray(): Promise<T[]> {
      const out: T[] = [];
      for await (const item of iter()) out.push(item);
      return out;
    },
  });
}

function normalize<T>(
  result: PageResult<T> | T[],
): { items: T[]; nextCursor?: string | null } {
  if (Array.isArray(result)) return { items: result };
  return { items: result.items, nextCursor: result.cursor ?? null };
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("aborted", "AbortError");
  }
}
