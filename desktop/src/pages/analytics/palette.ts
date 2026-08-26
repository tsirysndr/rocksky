import { css } from "@emotion/react";

export const chartPalette = css`
  --viz-series-1: #ff2876;
  --viz-series-2: #0891b2;
  --viz-series-3: #7c3aed;
  --viz-grid: rgba(0, 0, 0, 0.07);
  --viz-axis: #42576ca6;
  --viz-glow: rgba(255, 40, 118, 0.35);
  --viz-tooltip-bg: #ffffff;
  --viz-tooltip-border: rgba(0, 0, 0, 0.1);

  .dark & {
    --viz-series-1: #f53d82;
    --viz-series-2: #0e9db6;
    --viz-series-3: #9270ee;
    --viz-grid: rgba(255, 255, 255, 0.08);
    --viz-axis: rgb(191 174 195 / 65%);
    --viz-glow: rgba(245, 61, 130, 0.45);
    --viz-tooltip-bg: #1b0d33;
    --viz-tooltip-border: #310e64;
  }
`;

export const SERIES_1 = "var(--viz-series-1)";
export const SERIES_2 = "var(--viz-series-2)";
export const SERIES_3 = "var(--viz-series-3)";
export const GRID = "var(--viz-grid)";
export const AXIS = "var(--viz-axis)";
