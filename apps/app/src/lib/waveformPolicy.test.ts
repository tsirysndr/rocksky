import { describe, expect, test } from "bun:test";
import { REMOTE_WAVEFORM_WAIT_MS, validWaveform, waveformFallbackDelay } from "./waveformPolicy";

describe("remote waveform preference", () => {
  test("remote peaks, including silence, avoid phone generation", () => {
    expect(waveformFallbackDelay(Array(256).fill(0), "ready")).toBeNull();
    expect(waveformFallbackDelay(Array(256).fill(255))).toBeNull();
  });
  test("waits for a remote worker, but not old or unsuccessful players", () => {
    expect(waveformFallbackDelay(undefined, "pending")).toBe(REMOTE_WAVEFORM_WAIT_MS);
    expect(waveformFallbackDelay(undefined, "unavailable")).toBe(0);
    expect(waveformFallbackDelay(undefined)).toBe(0);
    expect(waveformFallbackDelay(undefined, "ready")).toBe(0);
  });
  test("rejects malformed or oversized peaks", () => {
    for (const peaks of [[], Array(257).fill(1), Array(256).fill(-1), Array(256).fill(256), Array(256).fill(0.5), Array(256).fill(NaN), Array(256).fill("1")]) {
      expect(validWaveform(peaks)).toBe(false);
      expect(waveformFallbackDelay(peaks, "ready")).toBe(0);
    }
  });
});
