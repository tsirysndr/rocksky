import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ScrobblePoint = { key: string; label: string; count: number };
const SERIES = "var(--viz-series-1)";
const tickDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function TimelineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ScrobblePoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 9,
        background: "var(--viz-tooltip-bg)",
        border: "1px solid var(--viz-tooltip-border)",
        boxShadow: "0 8px 24px #0003",
        fontSize: 13,
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
      }}
    >
      <div style={{ color: "var(--viz-axis)", fontSize: 11, marginBottom: 2 }}>
        {point.label}
      </div>
      <div style={{ color: "var(--color-text, var(--foreground))" }}>
        {point.count.toLocaleString("en")} scrobbles
      </div>
    </div>
  );
}

/** The same daily area plot is used on analytics and the public landing. */
export default function ScrobblesTimeline({
  points,
  darkMode = true,
  animate = true,
}: {
  points: ScrobblePoint[];
  darkMode?: boolean;
  animate?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const areaId = `scrobbles-area-${id}`;
  const glowId = `scrobbles-glow-${id}`;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart
        data={points}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        accessibilityLayer
      >
        <defs>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.45} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis
          dataKey="key"
          tickFormatter={(value: string) =>
            tickDate.format(new Date(`${value}T12:00:00`))
          }
          tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
        />
        <YAxis
          tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={52}
          allowDecimals={false}
          tickFormatter={(value: number) =>
            value >= 1000 ? compact.format(value).toLowerCase() : String(value)
          }
        />
        <Tooltip
          cursor={{ stroke: SERIES, strokeWidth: 1 }}
          content={<TimelineTooltip />}
          wrapperStyle={{ zIndex: 20 }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={SERIES}
          strokeWidth={2}
          fill={`url(#${areaId})`}
          filter={darkMode ? `url(#${glowId})` : undefined}
          activeDot={{ r: 4, strokeWidth: 2 }}
          isAnimationActive={animate}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
