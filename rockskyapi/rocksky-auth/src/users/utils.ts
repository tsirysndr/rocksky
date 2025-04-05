export function dedupeTracksKeepLyrics(tracks) {
  const trackMap = new Map();

  for (const track of tracks) {
    const key = track.track_number;
    console.log("key", key, track);

    if (!key) continue;

    const existing = trackMap.get(key);
    console.log("existing", existing);

    // If current has lyrics and either no existing or existing has no lyrics, replace it
    if (!existing || (!existing.lyrics && track.lyrics)) {
      trackMap.set(key, track);
    }
  }
  console.log("deduped tracks", trackMap);
  console.log(trackMap.values());

  return Array.from(trackMap.values());
}
