export type CalendarPoint = { key: string; count: number };
const DAY = 86_400_000;

function dayNumber(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const time = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === key
    ? time / DAY
    : null;
}

/** Fill missing UTC days and bound long ranges to a readable year of cells. */
export function listeningCalendar(
  points: CalendarPoint[],
  from: string,
  to: string,
) {
  const start = dayNumber(from);
  const end = dayNumber(to);
  if (start === null || end === null || start > end) return null;
  const first = Math.max(start, end - 364);
  const counts = new Map<string, number>();
  for (const point of points) {
    if (Number.isFinite(point.count) && point.count > 0) {
      counts.set(point.key, (counts.get(point.key) ?? 0) + point.count);
    }
  }
  const days = Array.from({ length: end - first + 1 }, (_, i) => {
    const key = new Date((first + i) * DAY).toISOString().slice(0, 10);
    return { key, count: counts.get(key) ?? 0 };
  });
  const max = Math.max(1, ...days.map((day) => day.count));
  const offset = (new Date(first * DAY).getUTCDay() + 6) % 7;
  return {
    days: days.map((day) => ({
      ...day,
      level: day.count ? Math.ceil((day.count / max) * 4) : 0,
    })),
    offset,
    weeks: Math.ceil((offset + days.length) / 7),
    truncated: first > start,
  };
}
