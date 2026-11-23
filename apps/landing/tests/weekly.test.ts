import { describe, expect, test } from "bun:test";
import { periodStart, weekStart } from "../src/weekly";

// Use separate processes so timezone fixtures never affect concurrent tests.
function bounds(timezone: string, now: string) {
  const script = `import { periodStart } from ${JSON.stringify(new URL("../src/weekly.ts", import.meta.url).pathname)};
    console.log(JSON.stringify(["today", "week", "month", "all"].map(period => periodStart(period, new Date(${JSON.stringify(now)})))));`;
  const result = Bun.spawnSync([process.execPath, "-e", script], {
    env: { ...process.env, TZ: timezone },
  });
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout.toString());
}

describe("chart periods follow the visitor’s local calendar", () => {
  test("Monday weeks also cover Sunday and year boundaries", () => {
    expect(weekStart(new Date(2026, 10, 23, 23, 59))).toBe(
      new Date(2026, 10, 23).toISOString(),
    );
    expect(weekStart(new Date(2026, 10, 29, 23, 59))).toBe(
      new Date(2026, 10, 23).toISOString(),
    );
    expect(weekStart(new Date(2027, 0, 1, 10))).toBe(
      new Date(2026, 11, 28).toISOString(),
    );
  });
  test("converts positive-offset local midnight to the previous UTC date", () => {
    expect(bounds("Indian/Antananarivo", "2026-11-23T12:00:00+03:00")).toEqual([
      "2026-11-22T21:00:00.000Z",
      "2026-11-22T21:00:00.000Z",
      "2026-10-31T21:00:00.000Z",
      null,
    ]);
  });
  test("uses each boundary’s DST offset, rather than today's offset", () => {
    expect(bounds("America/New_York", "2026-11-23T12:00:00-05:00")).toEqual([
      "2026-11-23T05:00:00.000Z",
      "2026-11-23T05:00:00.000Z",
      "2026-11-01T04:00:00.000Z",
      null,
    ]);
    expect(bounds("America/New_York", "2026-03-08T12:00:00-04:00")).toEqual([
      "2026-03-08T05:00:00.000Z",
      "2026-03-02T05:00:00.000Z",
      "2026-03-01T05:00:00.000Z",
      null,
    ]);
  });
  test("all time has no start boundary", () => {
    expect(periodStart("all", new Date())).toBeNull();
  });
});
