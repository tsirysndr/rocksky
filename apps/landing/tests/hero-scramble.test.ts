import { describe, expect, test } from "bun:test";
import { scrambleFrame, SCRAMBLE_DURATION } from "../src/hero-scramble";

describe("hero character scramble", () => {
  const text = "MUSIC SCROBBLING ON AT PROTOCOL";

  test("keeps character positions and spaces fixed during the animation", () => {
    for (let elapsed = 0; elapsed < SCRAMBLE_DURATION; elapsed += 33) {
      const frame = scrambleFrame(text, elapsed, () => 0.5);
      expect(frame).toHaveLength(text.length);
      for (let index = 0; index < text.length; index++) {
        expect(frame[index] === " ").toBe(text[index] === " ");
      }
    }
  });
  test("starts at the center and restores the complete label at the end", () => {
    const first = scrambleFrame(text, 50, () => 0);
    expect(first[0]).toBe(text[0]);
    expect(first.at(-1)).toBe(text.at(-1));
    expect(first).not.toBe(text);
    expect(scrambleFrame(text, SCRAMBLE_DURATION)).toBe(text);
    expect(scrambleFrame(text, SCRAMBLE_DURATION + 2600)).toBe(text);
  });
});
