import { describe, expect, it } from "bun:test";
import { remainingPlaybackMs } from "./playback";

const NOW = 1_700_000_000_000;

describe("remainingPlaybackMs", () => {
  it("keeps the status while the track is still playing", () => {
    // Started 30s ago, runs 3 minutes: 150s left, so a stop must not delete yet.
    const left = remainingPlaybackMs(
      { startedAt: NOW - 30_000, durationMs: 180_000 },
      NOW,
    );
    expect(left).toBe(150_000);
  });

  it("clears the status once the track has finished", () => {
    // Started 4 minutes ago, runs 3 minutes: finished, so a stop deletes now.
    expect(
      remainingPlaybackMs(
        { startedAt: NOW - 240_000, durationMs: 180_000 },
        NOW,
      ),
    ).toBe(0);
  });

  it("treats the exact end of the track as finished", () => {
    expect(
      remainingPlaybackMs(
        { startedAt: NOW - 180_000, durationMs: 180_000 },
        NOW,
      ),
    ).toBe(0);
  });

  it("does not defer when the duration is unknown", () => {
    // Deferring on a 0 duration would mean guessing how long to wait.
    expect(remainingPlaybackMs({ startedAt: NOW, durationMs: 0 }, NOW)).toBe(0);
  });

  it("does not defer when nothing is published", () => {
    expect(remainingPlaybackMs(null, NOW)).toBe(0);
    expect(remainingPlaybackMs(undefined, NOW)).toBe(0);
  });
});
