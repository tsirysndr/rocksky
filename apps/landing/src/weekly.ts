// Calendar weeks start on Monday at midnight UTC for every listener.
export function weekStart(now = new Date()): string {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start.toISOString();
}
