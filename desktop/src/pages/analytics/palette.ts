import { css } from "@emotion/react";

/**
 * Synthwave neon, stepped per surface (#ffffff light, #130825 dark) rather than
 * flipped. Both modes pass the dataviz validator on all-pairs; changing a hex
 * means re-running it. The light amber sits in the 6-8 CVD band against the
 * pink, which is legal only because every tile carries a visible label.
 */
export const chartPalette = css`
  --viz-series-1: #e10062;
  --viz-series-2: #0098c4;
  --viz-series-3: #7028dd;
  --viz-series-4: #a35a00;
  --viz-grid: rgba(0, 0, 0, 0.07);
  --viz-axis: #42576ca6;
  --viz-glow: rgba(225, 0, 98, 0.28);
  --viz-tooltip-bg: #ffffff;
  --viz-tooltip-border: rgba(0, 0, 0, 0.1);

  .dark & {
    --viz-series-1: #fb3d80;
    --viz-series-2: #17a2b8;
    --viz-series-3: #8f5ce8;
    --viz-series-4: #c07a00;
    --viz-grid: rgba(255, 255, 255, 0.08);
    --viz-axis: rgb(191 174 195 / 65%);
    --viz-glow: rgba(251, 61, 128, 0.45);
    --viz-tooltip-bg: #1b0d33;
    --viz-tooltip-border: #310e64;
  }
`;

export const SERIES_1 = "var(--viz-series-1)";
export const SERIES_2 = "var(--viz-series-2)";
export const SERIES_3 = "var(--viz-series-3)";
export const SERIES_4 = "var(--viz-series-4)";
export const GRID = "var(--viz-grid)";
export const AXIS = "var(--viz-axis)";
export const GLOW = "var(--viz-glow)";
