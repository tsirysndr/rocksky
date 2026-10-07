import { expect, test } from "bun:test";
import {
  completeDeviceMetadata,
  deviceQueueTrack,
} from "../src/lib/deviceMusicModel";

const tagged = {
  id: "3",
  filename: "03.mp3",
  title: "Music",
  artist: "Artist",
  album: "Album",
  durationMs: 180000,
  favorite: false,
};

test("display fallbacks never qualify an incomplete track for scrobbling", () => {
  for (const field of ["title", "artist", "album"]) {
    const incomplete = { ...tagged, [field]: "" };
    const queued = deviceQueueTrack(incomplete);
    expect(queued.title.length).toBeGreaterThan(0);
    expect(queued.artist.length).toBeGreaterThan(0);
    expect(queued.album.length).toBeGreaterThan(0);
    expect(queued.scrobbleEligible).toBe(false);
  }
  expect(deviceQueueTrack(tagged).scrobbleEligible).toBe(true);
});

test("unknown placeholders, invalid durations and overlong tags cannot be submitted", () => {
  for (const artist of ["<unknown>", "Unknown artist", "  ", "x".repeat(257)]) {
    expect(completeDeviceMetadata({ ...tagged, artist })).toBe(false);
  }
  for (const durationMs of [0, -1, NaN])
    expect(completeDeviceMetadata({ ...tagged, durationMs })).toBe(false);
  expect(completeDeviceMetadata({ ...tagged, title: "é".repeat(512) })).toBe(
    true,
  );
});

test("manual completion makes the next queue entry eligible without requiring artwork", () => {
  const incomplete = { ...tagged, album: "" };
  expect(deviceQueueTrack(incomplete).scrobbleEligible).toBe(false);
  const complete = deviceQueueTrack({
    ...incomplete,
    album: "Correct album",
    favorite: true,
  });
  expect(complete.scrobbleEligible).toBe(true);
  expect(complete.albumArtist).toBe("Artist");
  expect(complete.localId).toBe("3");
  expect(complete.liked).toBe(true);
  expect(complete.streamUrl).toBeUndefined();
});
