export type ChartPeriod = "today" | "week" | "month" | "all";

// Calendar boundaries follow the visitor’s timezone; API bounds are ISO instants.
export function weekStart(now = new Date()): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start.toISOString();
}

export function periodStart(
  period: ChartPeriod,
  now = new Date(),
): string | null {
  if (period === "all") return null;
  if (period === "week") return weekStart(now);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "month") start.setDate(1);
  return start.toISOString();
}
