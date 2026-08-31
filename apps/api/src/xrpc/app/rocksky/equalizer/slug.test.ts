import { describe, expect, it } from "bun:test";
import { presetRkey } from "./slug";

describe("presetRkey", () => {
  it("lowercases and dashes spaces", () => {
    expect(presetRkey("Bass Boost")).toBe("bass-boost");
    expect(presetRkey("Treble  Boost")).toBe("treble-boost");
  });

  it("strips characters that are not allowed", () => {
    expect(presetRkey("Rock 'n' Roll!")).toBe("rock-n-roll");
    expect(presetRkey("Café Vibes")).toBe("caf-vibes");
  });

  it("collapses and trims dashes", () => {
    expect(presetRkey("--My - Preset--")).toBe("my-preset");
    expect(presetRkey("a_b_c")).toBe("a-b-c");
  });

  it("is stable for an already-slugged name", () => {
    expect(presetRkey("bass-boost")).toBe("bass-boost");
  });

  it("returns empty for names with no usable characters", () => {
    expect(presetRkey("!!!")).toBe("");
    expect(presetRkey("   ")).toBe("");
  });
});
