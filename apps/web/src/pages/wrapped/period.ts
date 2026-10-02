import {
  WRAPPED_PERIODS,
  type WrappedData,
  type WrappedPeriod,
} from "../../api/wrapped";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026" for a calendar year, "the last 2 weeks" for a rolling window. */
export function scopeLabel(period: WrappedPeriod, year: number): string {
  if (period === "year") return String(year);
  const label = WRAPPED_PERIODS.find((p) => p.id === period)?.label ?? "";
  return `the ${label.toLowerCase()}`;
}

/** Title suffix: "2026" or "Last 2 weeks". */
export function titleLabel(period: WrappedPeriod, year: number): string {
  if (period === "year") return String(year);
  return WRAPPED_PERIODS.find((p) => p.id === period)?.label ?? "";
}

export function activityTitle(period: WrappedPeriod, year: number): string {
  return period === "year"
    ? `Your ${year} in Months`
    : `Your ${scopeLabel(period, year).replace(/^the /, "")}, day by day`;
}

/** Monthly bars for a year; one bar per UTC day (zero-filled) otherwise, since
 * the server only returns days that had plays. */
export function activityData(
  data: WrappedData | undefined,
  period: WrappedPeriod,
): { label: string; count: number }[] {
  if (period === "year" || !data?.startDate || !data?.endDate) {
    return MONTH_LABELS.map((label, i) => {
      const found = data?.scrobblesPerMonth.find((m) => m.month === i + 1);
      return { label, count: found?.count ?? 0 };
    });
  }
  const counts = new Map(
    (data.scrobblesPerDay ?? []).map((d) => [d.date, d.count]),
  );
  const start = new Date(data.startDate.slice(0, 10) + "T00:00:00Z").getTime();
  const end = new Date(data.endDate).getTime();
  const days: { label: string; count: number }[] = [];
  for (let t = start; t < end; t += DAY_MS) {
    const date = new Date(t);
    days.push({
      label: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      count: counts.get(date.toISOString().slice(0, 10)) ?? 0,
    });
  }
  return days;
}
