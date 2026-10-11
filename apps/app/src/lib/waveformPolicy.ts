/** Longer than the Rust worker's 120-second budget, allowing delivery time. */
export const REMOTE_WAVEFORM_WAIT_MS = 130_000;

export function validWaveform(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 256 &&
    value.every((peak) => Number.isInteger(peak) && peak >= 0 && peak <= 255);
}

export function waveformFallbackDelay(peaks: unknown, status?: string): number | null {
  if (validWaveform(peaks)) return null;
  return status === "pending" ? REMOTE_WAVEFORM_WAIT_MS : 0;
}
