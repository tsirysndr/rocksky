/** Pool energy, not maxima: one loud transient must not fill a whole UI bar. */
export function waveformLevels(peaks: readonly number[] | null, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    if (!peaks?.length) return 0;
    const start = Math.floor(i * peaks.length / count);
    const end = Math.max(start + 1, Math.floor((i + 1) * peaks.length / count));
    const values = peaks.slice(start, end);
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  });
}
