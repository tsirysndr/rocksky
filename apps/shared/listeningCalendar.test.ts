import { expect, test } from "bun:test";
import { listeningCalendar } from "./listeningCalendar";

test("fills missing days, keeps UTC alignment across DST, and ignores outside-range counts", () => {
  const calendar = listeningCalendar(
    [
      { key: "2026-03-07", count: 2 },
      { key: "2026-03-07", count: 3 },
      { key: "2026-03-09", count: 10 },
      { key: "2026-03-10", count: 10000 },
    ],
    "2026-03-07",
    "2026-03-09",
  )!;
  expect(calendar.offset).toBe(5);
  expect(calendar.weeks).toBe(2);
  expect(calendar.days).toEqual([
    { key: "2026-03-07", count: 5, level: 2 },
    { key: "2026-03-08", count: 0, level: 0 },
    { key: "2026-03-09", count: 10, level: 4 },
  ]);
});

test("includes leap days and rejects overflow dates, invalid ranges and reversed dates", () => {
  expect(
    listeningCalendar([], "2024-02-28", "2024-03-01")?.days.map((d) => d.key),
  ).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
  for (const [from, to] of [
    ["2026-02-29", "2026-03-01"],
    ["", "2026-01-01"],
    ["2026-03-02", "2026-03-01"],
  ])
    expect(listeningCalendar([], from, to)).toBeNull();
});

test("long ranges include the last 365 calendar days, even when empty", () => {
  const calendar = listeningCalendar([], "2000-01-01", "2026-10-11")!;
  expect(calendar.days).toHaveLength(365);
  expect(calendar.days[0].key).toBe("2025-10-12");
  expect(calendar.days[364].key).toBe("2026-10-11");
  expect(calendar.truncated).toBe(true);
  expect(calendar.days.every((d) => d.level === 0)).toBe(true);
});

test("ignores invalid counts and renders a one-day range", () => {
  const calendar = listeningCalendar(
    [
      { key: "2026-10-11", count: NaN },
      { key: "2026-10-11", count: -2 },
    ],
    "2026-10-11",
    "2026-10-11",
  )!;
  expect(calendar.days).toEqual([{ key: "2026-10-11", count: 0, level: 0 }]);
  expect(calendar.offset).toBe(6);
  expect(calendar.truncated).toBe(false);
});
