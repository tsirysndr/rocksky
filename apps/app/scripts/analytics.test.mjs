import assert from "node:assert/strict";
import test from "node:test";
import dayjs from "dayjs";
import { chartPoints, dailyPoints, presetRange, summarize, validDate } from "../src/screens/Analytics/data.ts";

test("missing and unordered UTC dates are filled without shifting timezone", () => {
  const points = dailyPoints([{ date: "2026-10-03T00:00:00.000Z", count: 4 }, { date: "2026-10-01", count: 2 }], { from: "2026-10-01", to: "2026-10-03", label: "Custom" });
  assert.deepEqual(points.map(p => p.count), [2, 0, 4]);
  const totals = summarize(points);
  assert.equal(totals.total, 6);
  assert.equal(totals.average, 2);
  assert.equal(totals.active, 2);
  assert.equal(totals.busiest.key, "2026-10-03");
  assert.equal(totals.weekdays[3].count, 2);
  assert.equal(totals.weekdays[5].count, 4);
});
test("all-time starts at the first actual listen", () => {
  const points = dailyPoints([{ date: "2026-10-01", count: 3 }], { from: "2000-01-01", to: "2026-10-03", label: "All time" });
  assert.equal(points.length, 3);
  assert.equal(summarize(points).average, 1);
});
test("empty history has no busiest day", () => {
  assert.equal(summarize(dailyPoints([], { from: "2026-10-01", to: "2026-10-03", label: "Custom" })).busiest, null);
});
test("long-range aggregation preserves every listen", () => {
  const range = { from: "2024-01-01", to: "2026-10-03", label: "Custom" };
  const points = dailyPoints([{ date: "2024-01-01", count: 7 }, { date: "2026-10-03", count: 5 }], range);
  const chart = chartPoints(points);
  assert.equal(chart.unit, "Monthly");
  assert.equal(chart.points.reduce((sum, p) => sum + p.count, 0), 12);
  assert.equal(chartPoints(points.slice(0, 200)).unit, "Weekly");
});
test("range presets include today and reject calendar overflow", () => {
  assert.deepEqual(presetRange("7 days", dayjs("2026-10-05")), { from: "2026-09-29", to: "2026-10-05", label: "7 days" });
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-1-1"), false);
});
