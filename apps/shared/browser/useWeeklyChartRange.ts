import { useEffect, useState } from "react";

/** Seven calendar dates, including today, in the listener's local timezone. */
export function weeklyChartRange(now = new Date()): [Date, Date] {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return [start, end];
}

export function useWeeklyChartRange(): [Date, Date] {
  const [range, setRange] = useState(() => weeklyChartRange());
  useEffect(() => {
    const update = () => {
      const next = weeklyChartRange();
      setRange((current) =>
        current[1].getTime() === next[1].getTime() ? current : next,
      );
    };
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return range;
}
