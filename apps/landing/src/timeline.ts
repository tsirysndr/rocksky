export type TimelineRange = { from: string; to: string };
export const timelinePeriods = [
  { months: 3, label: "Last 3 months" },
  { months: 6, label: "Last 6 months" },
  { months: 9, label: "Last 9 months" },
  { months: 12, label: "Last year" },
  { months: 24, label: "Last 2 years" },
  { months: 36, label: "Last 3 years" },
  { months: 48, label: "Last 4 years" },
  { months: 60, label: "Last 5 years" },
] as const;
export type TimelineMonths = (typeof timelinePeriods)[number]["months"];

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function timelineRange(
  months: TimelineMonths,
  now = new Date(),
): TimelineRange {
  const from = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const lastDay = new Date(
    from.getFullYear(),
    from.getMonth() + 1,
    0,
  ).getDate();
  from.setDate(Math.min(now.getDate(), lastDay));
  return { from: localDay(from), to: localDay(now) };
}

export function timelinePoints(
  rows: { date?: string; count?: number }[],
  range: TimelineRange,
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.date?.slice(0, 10);
    const count = Number(row.count);
    if (
      key &&
      /^\d{4}-\d{2}-\d{2}$/.test(key) &&
      Number.isInteger(count) &&
      count >= 0
    )
      counts.set(key, count);
  }
  const date = new Date(`${range.from}T12:00:00`);
  const end = new Date(`${range.to}T12:00:00`);
  const format = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const points = [];
  for (; date <= end; date.setDate(date.getDate() + 1)) {
    const key = localDay(date);
    points.push({
      key,
      label: format.format(date),
      count: counts.get(key) ?? 0,
    });
  }
  return points;
}
