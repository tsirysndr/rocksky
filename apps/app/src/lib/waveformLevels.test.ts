import { expect, test } from "bun:test";
import { waveformLevels } from "./waveformLevels";

test("isolated transients do not make whole bars full-height", () => {
  const levels = waveformLevels([255, 0, 0, 0, 255, 255, 255, 255], 2);
  expect(levels).toEqual([127.5, 255]);
});
test("preserves silence, constant levels, and quiet-to-loud sections", () => {
  expect(waveformLevels(null, 4)).toEqual([0, 0, 0, 0]);
  expect(waveformLevels([0, 0, 32, 32, 128, 128, 255, 255], 4)).toEqual([0, 32, 128, 255]);
  expect(waveformLevels([32], 4)).toEqual([32, 32, 32, 32]);
});
