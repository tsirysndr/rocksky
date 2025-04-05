export function dedupeTracksKeepLyrics(tracks) {
  const trackMap = new Map();

  for (const track of tracks) {
    const key = track.track_number;

    if (!key) continue;

    const existing = trackMap.get(key);

    // If current has lyrics and either no existing or existing has no lyrics, replace it
    if (!existing || (!existing.lyrics && track.lyrics)) {
      trackMap.set(key, track);
    }
  }

  return Array.from(trackMap.values());
}
