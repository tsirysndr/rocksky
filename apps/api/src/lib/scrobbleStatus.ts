import type { Track } from "types/track";

// Saved Android listens already carry the original playback start. Only infer
// now-playing while that playback window is still open; never replay history.
export function scrobbleStatus(did: string, track: Track, now = Date.now()) {
  const started = (track.timestamp ?? 0) * 1000;
  if (
    !track.timestamp ||
    !Number.isFinite(started) ||
    started <= 0 ||
    !Number.isFinite(track.duration) ||
    track.duration <= 0 ||
    started > now ||
    started + track.duration <= now
  )
    return null;
  return {
    did,
    track: {
      name: track.title,
      artist: track.artist,
      album: track.album,
      albumCoverUrl: track.albumArt ?? undefined,
      duration_ms: track.duration,
      started_at: started,
      source: "scrobble",
    },
  };
}
