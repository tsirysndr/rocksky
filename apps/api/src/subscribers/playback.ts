/**
 * Milliseconds left of a published now-playing status, or 0 once the track has
 * finished (or when its duration is unknown, where deferring would mean
 * guessing how long to wait).
 *
 * A websocket source that drops its connection fires song.stopped straight
 * away, which would otherwise clear a status for a track that is still
 * playing. Spotify polls instead of holding a socket, which is why it was the
 * only source this never affected.
 */
export function remainingPlaybackMs(
  last: { startedAt: number; durationMs: number } | null | undefined,
  now: number,
): number {
  if (!last?.durationMs) return 0;
  return Math.max(0, last.startedAt + last.durationMs - now);
}
