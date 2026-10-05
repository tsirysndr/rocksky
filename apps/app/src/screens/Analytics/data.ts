import type { ChartsScrobbleViewBasic } from "@rocksky/sdk";
import dayjs from "dayjs";
import type { AnalyticsRange } from "../../api/analytics";

export type Point = { key: string; label: string; count: number };
export const presets = [
  "7 days",
  "30 days",
  "90 days",
  "12 months",
  "All time",
] as const;
export function presetRange(label: string, now = dayjs()): AnalyticsRange {
  const days = (
    { "7 days": 7, "30 days": 30, "90 days": 90, "12 months": 365 } as Record<
      string,
      number
    >
  )[label];
  return {
    from: days
      ? now.subtract(days - 1, "day").format("YYYY-MM-DD")
      : "2000-01-01",
    to: now.format("YYYY-MM-DD"),
    label,
  };
}
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    dayjs(date).isValid() &&
    dayjs(date).format("YYYY-MM-DD") === date
  );
}
export function dailyPoints(
  rows: ChartsScrobbleViewBasic[],
  range: AnalyticsRange,
): Point[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.date?.slice(0, 10);
    if (!key || !validDate(key) || key < range.from || key > range.to) continue;
    counts.set(
      key,
      (counts.get(key) ?? 0) + Math.max(0, Number(row.count) || 0),
    );
  }
  const first = [...counts.keys()].sort()[0];
  // Do not make all-time averages include years before the first listen.
  const from = range.label === "All time" ? (first ?? range.to) : range.from;
  const points: Point[] = [];
  for (
    let date = dayjs(from);
    date.format("YYYY-MM-DD") <= range.to;
    date = date.add(1, "day")
  ) {
    const key = date.format("YYYY-MM-DD");
    points.push({
      key,
      label: date.format("ddd, D MMM YYYY"),
      count: counts.get(key) ?? 0,
    });
  }
  return points;
}
export function summarize(points: Point[]) {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const active = points.filter((point) => point.count > 0).length;
  const busiest = points.reduce<Point | null>(
    (best, point) => (point.count > (best?.count ?? 0) ? point : best),
    null,
  );
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
    (label) => ({ key: label, label, count: 0 }),
  );
  const months = new Map<string, Point>();
  for (const point of points) {
    weekdays[(dayjs(point.key).day() + 6) % 7].count += point.count;
    const key = point.key.slice(0, 7);
    const month = months.get(key) ?? {
      key,
      label: dayjs(`${key}-01`).format("MMM YY"),
      count: 0,
    };
    month.count += point.count;
    months.set(key, month);
  }
  return {
    total,
    active,
    busiest,
    average: total / Math.max(1, points.length),
    weekdays,
    months: [...months.values()],
  };
}
export function chartPoints(points: Point[]): {
  points: Point[];
  unit: string;
} {
  if (points.length <= 90) return { points, unit: "Daily" };
  const monthly = points.length > 730;
  const buckets = new Map<string, Point>();
  for (const point of points) {
    const key = monthly
      ? `${point.key.slice(0, 7)}-01`
      : dayjs(point.key)
          .subtract((dayjs(point.key).day() + 6) % 7, "day")
          .format("YYYY-MM-DD");
    const bucket = buckets.get(key) ?? {
      key,
      label: monthly
        ? dayjs(key).format("MMMM YYYY")
        : `Week of ${dayjs(key).format("D MMM YYYY")}`,
      count: 0,
    };
    bucket.count += point.count;
    buckets.set(key, bucket);
  }
  return {
    points: [...buckets.values()],
    unit: monthly ? "Monthly" : "Weekly",
  };
}
