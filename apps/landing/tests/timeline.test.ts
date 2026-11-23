import { describe, expect, test } from "bun:test";
import { threeMonthsRange, timelinePoints } from "../src/timeline";

describe("global three-month timeline", () => {
  test("uses three calendar months and clamps shorter month endings", () => {
    expect(threeMonthsRange(new Date(2026, 10, 23))).toEqual({
      from: "2026-08-23",
      to: "2026-11-23",
    });
    expect(threeMonthsRange(new Date(2026, 4, 31))).toEqual({
      from: "2026-02-28",
      to: "2026-05-31",
    });
    expect(threeMonthsRange(new Date(2024, 4, 31))).toEqual({
      from: "2024-02-29",
      to: "2024-05-31",
    });
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
