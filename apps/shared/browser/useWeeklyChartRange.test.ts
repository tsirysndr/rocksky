import { describe, expect, it } from "bun:test";
import { weeklyChartRange } from "./useWeeklyChartRange";

describe("weekly chart dates", () => {
  it("includes exactly seven local calendar dates, including today", () => {
    const [start, end] = weeklyChartRange(new Date(2026, 10, 25, 14, 30));
    expect(start).toEqual(new Date(2026, 10, 19, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 10, 25, 23, 59, 59, 999));
  });

  it("rolls the window at midnight and across a year boundary", () => {
    const before = weeklyChartRange(new Date(2026, 11, 31, 23, 59));
    const after = weeklyChartRange(new Date(2027, 0, 1, 0, 0));
    expect(before[0]).toEqual(new Date(2026, 11, 25));
    expect(after[0]).toEqual(new Date(2026, 11, 26));
    expect(after[1]).toEqual(new Date(2027, 0, 1, 23, 59, 59, 999));
  });

  it("keeps request boundaries stable within a day without mutating the clock", () => {
    const now = new Date(2026, 10, 25, 8);
    const original = now.getTime();
    expect(weeklyChartRange(now)).toEqual(
      weeklyChartRange(new Date(2026, 10, 25, 23)),
    );
    expect(now.getTime()).toBe(original);
  });

  it("uses calendar arithmetic across daylight saving changes", () => {
    const [start, end] = weeklyChartRange(new Date(2026, 2, 10, 12));
    expect(start).toEqual(new Date(2026, 2, 4));
    expect(end).toEqual(new Date(2026, 2, 10, 23, 59, 59, 999));
  });
});
