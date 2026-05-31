import { describe, expect, it } from "bun:test";
import { paginate } from "../src";

describe("paginate", () => {
  it("offset/limit: yields all items across pages", async () => {
    const pages = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12],
    ];
    const calls: { limit: number; offset: number }[] = [];
    const iter = paginate<number>({
      fetch: async ({ limit, offset }) => {
        calls.push({ limit, offset });
        return pages.shift() ?? [];
      },
      pageSize: 5,
    });

    const out: number[] = [];
    for await (const n of iter) out.push(n);
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(calls).toEqual([
      { limit: 5, offset: 0 },
      { limit: 5, offset: 5 },
      { limit: 5, offset: 10 },
    ]);
  });

  it("offset/limit: stops on short page", async () => {
    let i = 0;
    const iter = paginate<number>({
      fetch: async () => {
        i++;
        return i === 1 ? [1, 2, 3, 4, 5] : [6, 7]; // short
      },
      pageSize: 5,
    });
    const out = await iter.toArray();
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(i).toBe(2);
  });

  it("cursor-based: stops when cursor is missing", async () => {
    type Item = { id: number };
    const responses: { items: Item[]; cursor?: string }[] = [
      { items: [{ id: 1 }, { id: 2 }], cursor: "c1" },
      { items: [{ id: 3 }, { id: 4 }], cursor: "c2" },
      { items: [{ id: 5 }] }, // no cursor
    ];
    const cursors: (string | undefined)[] = [];
    const iter = paginate<Item>({
      fetch: async ({ cursor }) => {
        cursors.push(cursor);
        return responses.shift() ?? { items: [] };
      },
      pageSize: 2,
    });

    const out = await iter.toArray();
    expect(out.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
    expect(cursors).toEqual([undefined, "c1", "c2"]);
  });

  it("respects maxItems", async () => {
    const iter = paginate<number>({
      fetch: async ({ offset }) => [offset, offset + 1, offset + 2],
      pageSize: 3,
      maxItems: 5,
    });
    expect(await iter.toArray()).toEqual([0, 1, 2, 3, 4]);
  });

  it("aborts when signal is fired", async () => {
    const controller = new AbortController();
    const iter = paginate<number>({
      fetch: async ({ offset }) => {
        if (offset === 5) controller.abort();
        return [offset, offset + 1, offset + 2, offset + 3, offset + 4];
      },
      pageSize: 5,
      signal: controller.signal,
    });

    const collected: number[] = [];
    await expect(
      (async () => {
        for await (const n of iter) collected.push(n);
      })(),
    ).rejects.toBeDefined();
    expect(collected).toEqual([0, 1, 2, 3, 4]);
  });

  it("toArray collects everything", async () => {
    let n = 0;
    const arr = await paginate<number>({
      fetch: async () => (n++ < 3 ? [n] : []),
      pageSize: 1,
    }).toArray();
    expect(arr).toEqual([1, 2, 3]);
  });
});
