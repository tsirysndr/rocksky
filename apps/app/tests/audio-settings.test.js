import { describe, expect, mock, test } from "bun:test";

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {},
}));
mock.module("../src/storage", () => ({
  storage: { getToken: () => "test", getDid: () => "test" },
}));
mock.module("../src/consts", () => ({ API_URL: "https://example.invalid" }));
const { toRemoteAudioSettings, withDefaults } = await import(
  "../src/api/audioSettings"
);

describe("audio settings wire format", () => {
  test("sends every exposed setting, with wire units intact", () => {
    const settings = {
      equalizer: {
        enabled: true,
        precut: -40,
        bands: [{ frequency: 32, gain: 65, q: 70 }],
      },
      tone: { bass: 3, treble: -2, balance: 25, channels: "monoLeft" },
      crossfade: {
        mode: "enabled",
        fadeInDelay: 250,
        fadeInDuration: 4500,
        fadeOutDelay: 500,
        fadeOutDuration: 6000,
        fadeOutMixMode: "mix",
      },
      replayGain: {
        mode: "trackIfShuffling",
        preamp: -35,
        preventClipping: true,
      },
    };
    expect(toRemoteAudioSettings(settings)).toEqual({
      ...settings,
      tone: { ...settings.tone, stereoWidth: 100 },
    });
  });
  test("wide uses custom stereo width and disabling is explicit", () => {
    expect(toRemoteAudioSettings({ tone: { channels: "wide" } }).tone).toEqual({
      channels: "custom",
      stereoWidth: 150,
    });
    const settings = toRemoteAudioSettings(withDefaults(null));
    expect(settings.crossfade?.mode).toBe("off");
    expect(settings.replayGain?.mode).toBe("off");
    expect(settings.equalizer?.bands).toHaveLength(10);
  });
  test("a sparse change leaves other fields absent", () => {
    expect(toRemoteAudioSettings({ tone: { balance: -15 } })).toEqual({
      tone: { balance: -15 },
    });
  });
});
