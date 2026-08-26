import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import numeral from "numeral";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { profileAtom } from "../../atoms/profile";
import BackButton from "../../components/BackButton";
import { rocksky } from "../../lib/rocksky";
import Main from "../../layouts/Main";
import DateRangePicker, { presetRange, type Range } from "./DateRangePicker";
import {
  AXIS,
  GLOW,
  GRID,
  SERIES_1,
  SERIES_2,
  SERIES_3,
  SERIES_4,
  chartPalette,
} from "./palette";

const Page = styled.div`
  ${chartPalette}
  margin-top: 70px;
  margin-bottom: 160px;
`;

const Title = styled.h1`
  margin: 0 0 4px;
  font-size: 1.75rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
`;

const Header = styled.div`
  margin-bottom: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
`;

const Scope = styled.div`
  display: flex;
  gap: 6px;
  padding-top: 6px;
`;

const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
`;

const Tile = styled.div<{ accent: string }>`
  position: relative;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid
    ${({ accent }) => `color-mix(in srgb, ${accent} 35%, transparent)`};
  background: ${({ accent }) =>
    `linear-gradient(160deg, color-mix(in srgb, ${accent} 16%, transparent), color-mix(in srgb, ${accent} 4%, transparent))`};
  overflow: hidden;

  /* The lit top edge — the tile reads as neon without tinting its numbers,
     which stay on text tokens. */
  &::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: ${({ accent }) => accent};
    box-shadow: ${({ accent }) => `0 0 12px ${accent}`};
  }
`;

const TileLabel = styled.div`
  font-size: 0.7rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  font-family: RockfordSansMedium;
`;

const TileValue = styled.div`
  margin-top: 6px;
  font-size: 1.6rem;
  color: var(--color-text);
  font-family: var(--font-mono);
`;

const TileNote = styled.div`
  margin-top: 2px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
`;

const Grid2 = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
`;

const Panel = styled.section`
  padding: 18px 18px 8px;
  border-radius: 16px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  background: var(--color-background);
  margin-bottom: 20px;
`;

const PanelTitle = styled.h2`
  margin: 0 0 2px;
  font-size: 1rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const PanelNote = styled.p`
  margin: 0 0 14px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
`;

const Empty = styled.div`
  padding: 48px 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
`;

const TooltipBox = styled.div`
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--viz-tooltip-bg);
  border: 1px solid var(--viz-tooltip-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-size: 0.8125rem;
`;

const TooltipLabel = styled.div`
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  margin-bottom: 2px;
`;

const TooltipValue = styled.div`
  color: var(--color-text);
  font-family: var(--font-mono);
`;

const PanelHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const Toggle = styled.button<{ active: boolean }>`
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid
    ${({ active }) => (active ? "transparent" : "rgba(128,128,128,0.28)")};
  background: ${({ active }) =>
    active ? "var(--color-primary)" : "transparent"};
  color: ${({ active }) => (active ? "#fff" : "var(--color-text-muted)")};
  font-family: RockfordSansMedium;
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    color: ${({ active }) => (active ? "#fff" : "var(--color-text)")};
  }
`;

const Board = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0 0 10px;
`;

const BoardRow = styled.li`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 6px;
  border-radius: 10px;
  text-decoration: none;

  &:hover {
    background: var(--color-menu-hover);
  }
`;

const Rank = styled.span`
  width: 22px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const Avatar = styled.img`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
`;

const Who = styled.div`
  min-width: 0;
  flex: 1;
`;

const WhoName = styled.div`
  font-size: 0.875rem;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const WhoHandle = styled.div`
  font-size: 0.75rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meter = styled.div`
  flex: 1.4;
  height: 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.16);
  overflow: hidden;

  @media (max-width: 720px) {
    display: none;
  }
`;

const MeterFill = styled.div<{ pct: number }>`
  width: ${({ pct }) => pct}%;
  height: 100%;
  border-radius: 4px;
  background: ${SERIES_1};
  box-shadow: 0 0 10px ${GLOW};
`;

const Count = styled.div`
  width: 92px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-text);
`;

const CountNote = styled.div`
  font-size: 0.7rem;
  color: var(--color-text-muted);
`;

type Point = { key: string; label: string; count: number };

function VizTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <TooltipBox>
      <TooltipLabel>{point.label}</TooltipLabel>
      <TooltipValue>
        {numeral(point.count).format("0,0")} {unit}
      </TooltipValue>
    </TooltipBox>
  );
}

/**
 * Flat translucent fill with a full-opacity outline — the outline is what keeps
 * the mark legible at this fill opacity.
 *
 * Deliberately unfiltered: the glow these bars used to reference was never
 * actually rendered, because recharts drops children that are not raw SVG tags
 * and the defs lived in a component. Chromium ignored the dangling reference
 * and drew the bar anyway; WebKit refused to draw it at all. Resolving the
 * filter would add a halo the deployed build does not have, so the reference
 * is gone instead of fixed.
 */
const neonBar = (color: string) => ({
  fill: color,
  fillOpacity: 0.3,
  stroke: color,
  strokeWidth: 1.5,
});

/** Large global totals need compacting or the axis eats the plot. */
const compact = (value: number) =>
  value >= 1000 ? numeral(value).format("0.[0]a") : String(value);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Analytics() {
  const profile = useAtomValue(profileAtom);
  // profileAtom fills in asynchronously and resets across layout remounts;
  // the stored DID is what makes the scope synchronous. With neither, the
  // queries fall back to Rocksky-wide numbers instead of rendering nothing.
  const ownDid = profile?.did ?? localStorage.getItem("did") ?? undefined;
  const [range, setRange] = useState<Range>(() => presetRange("30 days"));
  const [allTime, setAllTime] = useState(false);
  const [scope, setScope] = useState<"mine" | "global">("mine");

  // Signed out there is nothing to scope to, so the switch is hidden and every
  // query runs Rocksky-wide.
  const did = ownDid && scope === "mine" ? ownDid : undefined;

  const daily = useQuery({
    queryKey: ["analytics", "daily", did, range.from, range.to],
    queryFn: async () => {
      const res = await rocksky().scrobblesChart({
        did,
        from: range.from,
        to: range.to,
      });
      return (res.scrobbles ?? []).map((s) => ({
        key: dayjs(s.date).format("YYYY-MM-DD"),
        label: dayjs(s.date).format("dddd D MMMM YYYY"),
        count: s.count ?? 0,
      })) satisfies Point[];
    },
  });

  const topArtists = useQuery({
    queryKey: ["analytics", "artists", did, range.from, range.to],
    queryFn: () =>
      rocksky().topArtistsInterval(
        10,
        0,
        {
          startDate: dayjs(range.from).toISOString(),
          endDate: dayjs(range.to).endOf("day").toISOString(),
        },
        did,
      ),
  });

  const topTracks = useQuery({
    queryKey: ["analytics", "tracks", did, range.from, range.to],
    queryFn: () =>
      rocksky().topTracksInterval(
        10,
        0,
        {
          startDate: dayjs(range.from).toISOString(),
          endDate: dayjs(range.to).endOf("day").toISOString(),
        },
        did,
      ),
  });

  const scrobblers = useQuery({
    queryKey: ["analytics", "scrobblers", range.from, range.to, allTime],
    queryFn: () =>
      rocksky().topScrobblers(
        20,
        0,
        allTime
          ? {}
          : {
              startDate: dayjs(range.from).toISOString(),
              endDate: dayjs(range.to).endOf("day").toISOString(),
            },
      ),
  });

  const points = useMemo(() => daily.data ?? [], [daily.data]);

  const totals = useMemo(() => {
    const scrobbles = points.reduce((sum, p) => sum + p.count, 0);
    const activeDays = points.filter((p) => p.count > 0).length;
    const busiest = points.reduce<Point | null>(
      (best, p) => (!best || p.count > best.count ? p : best),
      null,
    );
    const spanDays = Math.max(
      1,
      dayjs(range.to).diff(dayjs(range.from), "day") + 1,
    );
    return {
      scrobbles,
      activeDays,
      busiest,
      perDay: scrobbles / spanDays,
      spanDays,
    };
  }, [points, range.from, range.to]);

  const byWeekday = useMemo(() => {
    const buckets = WEEKDAYS.map((label) => ({ label, key: label, count: 0 }));
    for (const p of points) {
      const idx = (dayjs(p.key).day() + 6) % 7;
      buckets[idx].count += p.count;
    }
    return buckets;
  }, [points]);

  const byMonth = useMemo(() => {
    const buckets = new Map<string, Point>();
    for (const p of points) {
      const key = dayjs(p.key).format("YYYY-MM");
      const existing = buckets.get(key);
      if (existing) existing.count += p.count;
      else
        buckets.set(key, {
          key,
          label: dayjs(p.key).format("MMMM YYYY"),
          count: p.count,
        });
    }
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [points]);

  const artistBars = useMemo(
    () =>
      (topArtists.data ?? []).map((a) => ({
        key: a.id ?? a.name ?? "",
        label: a.name ?? "",
        count: a.playCount ?? 0,
      })),
    [topArtists.data],
  );

  const trackBars = useMemo(
    () =>
      (topTracks.data ?? []).map((t) => ({
        key: t.id ?? t.title ?? "",
        label: `${t.title ?? ""} — ${t.artist ?? ""}`,
        count: t.playCount ?? 0,
      })),
    [topTracks.data],
  );

  const board = scrobblers.data ?? [];
  const topCount = board[0]?.scrobbles ?? 0;

  const loading = daily.isLoading;
  const hasData = points.some((p) => p.count > 0);

  return (
    <Main>
      <Page>
        <BackButton />
        <Header>
          <div>
            <Title>Analytics</Title>
            <Subtitle>
              {did
                ? `Listening for @${profile?.handle ?? "you"}`
                : "Listening across Rocksky."}
            </Subtitle>
          </div>
          {ownDid && (
            <Scope>
              <Toggle
                type="button"
                active={scope === "mine"}
                onClick={() => setScope("mine")}
              >
                My listening
              </Toggle>
              <Toggle
                type="button"
                active={scope === "global"}
                onClick={() => setScope("global")}
              >
                All of Rocksky
              </Toggle>
            </Scope>
          )}
        </Header>

        <DateRangePicker value={range} onChange={setRange} />

        <Tiles>
          <Tile accent={SERIES_1}>
            <TileLabel>Scrobbles</TileLabel>
            <TileValue>{numeral(totals.scrobbles).format("0,0")}</TileValue>
            <TileNote>over {totals.spanDays} days</TileNote>
          </Tile>
          <Tile accent={SERIES_2}>
            <TileLabel>Per day</TileLabel>
            <TileValue>{numeral(totals.perDay).format("0,0.0")}</TileValue>
            <TileNote>daily average</TileNote>
          </Tile>
          <Tile accent={SERIES_3}>
            <TileLabel>Active days</TileLabel>
            <TileValue>{numeral(totals.activeDays).format("0,0")}</TileValue>
            <TileNote>
              {numeral(
                totals.spanDays ? totals.activeDays / totals.spanDays : 0,
              ).format("0%")}{" "}
              of the range
            </TileNote>
          </Tile>
          <Tile accent={SERIES_4}>
            <TileLabel>Busiest day</TileLabel>
            <TileValue>
              {numeral(totals.busiest?.count ?? 0).format("0,0")}
            </TileValue>
            <TileNote>
              {totals.busiest
                ? dayjs(totals.busiest.key).format("D MMM YYYY")
                : "—"}
            </TileNote>
          </Tile>
        </Tiles>

        <Panel>
          <PanelTitle>Scrobbles over time</PanelTitle>
          <PanelNote>Daily play count across the selected range.</PanelNote>
          {loading || !hasData ? (
            <Empty>{loading ? "Loading…" : "Nothing scrobbled in this range."}</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="viz-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES_1} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={SERIES_1} stopOpacity={0} />
                  </linearGradient>
                  <filter
                    id="viz-area-glow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => dayjs(v).format("D MMM")}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  allowDecimals={false}
                  tickFormatter={compact}
                />
                <Tooltip
                  cursor={{ stroke: SERIES_1, strokeWidth: 1 }}
                  content={<VizTooltip unit="scrobbles" />}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={SERIES_1}
                  strokeWidth={2}
                  fill="url(#viz-area)"
                  filter="url(#viz-area-glow)"
                  activeDot={{ r: 4, strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Grid2>
          <Panel>
            <PanelTitle>Listening by weekday</PanelTitle>
            <PanelNote>Every play in the range, folded onto the week.</PanelNote>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byWeekday} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  allowDecimals={false}
                  tickFormatter={compact}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  content={<VizTooltip unit="scrobbles" />}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                  {...neonBar(SERIES_1)}
                />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel>
            <PanelTitle>Monthly totals</PanelTitle>
            <PanelNote>How the range breaks down month by month.</PanelNote>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byMonth} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={(v) => dayjs(v).format("MMM")}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  allowDecimals={false}
                  tickFormatter={compact}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  content={<VizTooltip unit="scrobbles" />}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                  {...neonBar(SERIES_2)}
                />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </Grid2>

        <Grid2>
          <Panel>
            <PanelTitle>Top artists</PanelTitle>
            <PanelNote>Most played in the selected range.</PanelNote>
            {artistBars.length === 0 ? (
              <Empty>{topArtists.isLoading ? "Loading…" : "No artists yet."}</Empty>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, artistBars.length * 34)}>
                <BarChart data={artistBars} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={150}
                    tickFormatter={(v: string) =>
                      v.length > 20 ? `${v.slice(0, 19)}…` : v
                    }
                  />
                  <Tooltip cursor={{ fill: "transparent" }} content={<VizTooltip unit="plays" />} />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                    {...neonBar(SERIES_1)}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel>
            <PanelTitle>Top tracks</PanelTitle>
            <PanelNote>Most played in the selected range.</PanelNote>
            {trackBars.length === 0 ? (
              <Empty>{topTracks.isLoading ? "Loading…" : "No tracks yet."}</Empty>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, trackBars.length * 34)}>
                <BarChart data={trackBars} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={170}
                    tickFormatter={(v: string) =>
                      v.length > 24 ? `${v.slice(0, 23)}…` : v
                    }
                  />
                  <Tooltip cursor={{ fill: "transparent" }} content={<VizTooltip unit="plays" />} />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                    {...neonBar(SERIES_2)}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </Grid2>

        <Panel>
          <PanelHead>
            <div>
              <PanelTitle>Top scrobblers</PanelTitle>
              <PanelNote>
                {allTime
                  ? "The most active listeners on Rocksky, all time."
                  : `The most active listeners between ${dayjs(range.from).format("D MMM YYYY")} and ${dayjs(range.to).format("D MMM YYYY")}.`}
              </PanelNote>
            </div>
            <div className="flex gap-[6px]">
              <Toggle
                type="button"
                active={!allTime}
                onClick={() => setAllTime(false)}
              >
                Selected range
              </Toggle>
              <Toggle
                type="button"
                active={allTime}
                onClick={() => setAllTime(true)}
              >
                All time
              </Toggle>
            </div>
          </PanelHead>
          {board.length === 0 ? (
            <Empty>
              {scrobblers.isLoading ? "Loading…" : "Nobody scrobbled yet."}
            </Empty>
          ) : (
            <Board>
              {board.map((s, i) => (
                <BoardRow key={s.did ?? i}>
                  <Rank>{i + 1}</Rank>
                  {s.avatar ? (
                    <Avatar src={s.avatar} alt="" />
                  ) : (
                    <Avatar as="div" />
                  )}
                  <Who>
                    <Link
                      to="/profile/$did"
                      params={{ did: s.did ?? "" }}
                      style={{ textDecoration: "none" }}
                    >
                      <WhoName>{s.displayName || s.handle}</WhoName>
                    </Link>
                    <WhoHandle>@{s.handle}</WhoHandle>
                  </Who>
                  <Meter>
                    <MeterFill
                      pct={
                        topCount ? ((s.scrobbles ?? 0) / topCount) * 100 : 0
                      }
                    />
                  </Meter>
                  <div>
                    <Count>{numeral(s.scrobbles ?? 0).format("0,0")}</Count>
                    <CountNote className="text-right">
                      {numeral(s.uniqueArtists ?? 0).format("0,0")} artists
                    </CountNote>
                  </div>
                </BoardRow>
              ))}
            </Board>
          )}
        </Panel>
      </Page>
    </Main>
  );
}

export default Analytics;
