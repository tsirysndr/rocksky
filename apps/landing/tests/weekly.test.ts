import { describe, expect, test } from "bun:test";
import { weekStart } from "../src/weekly";

describe("weekly charts use a shared UTC calendar week", () => {
  test("starts on Monday, including Sunday and year boundaries", () => {
    expect(weekStart(new Date("2026-11-23T23:59:00Z"))).toBe(
      "2026-11-23T00:00:00.000Z",
    );
    expect(weekStart(new Date("2026-11-29T23:59:59Z"))).toBe(
      "2026-11-23T00:00:00.000Z",
    );
    expect(weekStart(new Date("2027-01-01T10:00:00Z"))).toBe(
      "2026-12-28T00:00:00.000Z",
    );
  });
  test("uses UTC rather than the browser's local day", () => {
    expect(weekStart(new Date("2026-11-23T01:00:00+03:00"))).toBe(
      "2026-11-16T00:00:00.000Z",
    );
  });
});
