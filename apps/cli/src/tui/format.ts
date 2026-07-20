/** Format a millisecond duration as `m:ss` (empty string when unknown). */
export function fmtDuration(ms?: number | null): string {
  if (!ms || ms < 0) return "";
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
