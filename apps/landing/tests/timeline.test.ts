import { describe, expect, test } from "bun:test";
import { timelineRange, timelinePoints } from "../src/timeline";

describe("global listening timeline", () => {
  test("uses three calendar months and clamps shorter month endings", () => {
    expect(timelineRange(3, new Date(2026, 10, 23))).toEqual({
      from: "2026-08-23",
      to: "2026-11-23",
    });
    expect(timelineRange(3, new Date(2026, 4, 31))).toEqual({
      from: "2026-02-28",
      to: "2026-05-31",
    });
    expect(timelineRange(3, new Date(2024, 4, 31))).toEqual({
      from: "2024-02-29",
      to: "2024-05-31",
    });
  });
  test("supports each selectable range across year boundaries", () => {
    for (const [months, from] of [
      [3, "2026-08-24"],
      [6, "2026-05-24"],
      [9, "2026-02-24"],
      [12, "2025-11-24"],
      [24, "2024-11-24"],
    ] as const) {
      expect(timelineRange(months, new Date(2026, 10, 24))).toEqual({
        from,
        to: "2026-11-24",
      });
    }
  });
  test("clamps leap days for year ranges and fills all daily points", () => {
    for (const months of [12, 24] as const) {
      const range = timelineRange(months, new Date(2024, 1, 29));
      expect(range.from).toBe(months === 12 ? "2023-02-28" : "2022-02-28");
      const points = timelinePoints([], range);
      expect(points[0].key).toBe(range.from);
      expect(points.at(-1)!.key).toBe(range.to);
      expect(points).toHaveLength(months === 12 ? 367 : 732);
    }
  });
  test("includes both endpoints and plots missing days as zero", () => {
    const points = timelinePoints(
      [
        { date: "2026-11-01T00:00:00.000Z", count: 12 },
        { date: "2026-11-03", count: 7 },
      ],
      { from: "2026-11-01", to: "2026-11-03" },
    );
    expect(points.map((point) => [point.key, point.count])).toEqual([
      ["2026-11-01", 12],
      ["2026-11-02", 0],
      ["2026-11-03", 7],
    ]);
  });
  test("does not include observations outside the selected period or invalid counts", () => {
    const points = timelinePoints(
      [
        { date: "2026-10-31", count: 999 },
        { date: "2026-11-01", count: Number.NaN },
        { date: "2026-11-02", count: -1 },
        { count: 10 },
      ],
      { from: "2026-11-01", to: "2026-11-02" },
    );
    expect(points.map((point) => point.count)).toEqual([0, 0]);
  });
});
