import { expect, test } from "bun:test";
import { scrobbleStatus } from "./scrobbleStatus";

const now = 1_800_000_000_000;
const track = {
  title: "Song",
  artist: "Artist",
  album: "Album",
  albumArtist: "Artist",
  timestamp: now / 1000 - 100,
  duration: 200_000,
};

test("Android's qualifying listen preserves the original playback window", () => {
  const event = scrobbleStatus("did:plc:android", track, now)!;
  expect(event.did).toBe("did:plc:android");
  expect(event.track.started_at).toBe(now - 100_000);
  expect(event.track.duration_ms).toBe(200_000);
  expect(event.track.source).toBe("scrobble");
});

test("offline history, future starts and unknown playback windows never become live status", () => {
  for (const input of [
    { ...track, timestamp: now / 1000 - 201 },
    { ...track, timestamp: now / 1000 - 200 },
    { ...track, timestamp: now / 1000 + 1 },
    { ...track, timestamp: undefined },
    { ...track, duration: 0 },
    { ...track, duration: NaN },
  ])
    expect(scrobbleStatus("did:plc:android", input, now)).toBeNull();
});
