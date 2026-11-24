import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useReducedMotion } from "framer-motion";
import ScrobblesTimeline from "../../shared/browser/ScrobblesTimeline";
import { client, liveAtom } from "./data";
import {
  timelinePeriods,
  timelineRange,
  timelinePoints,
  type TimelineMonths,
} from "./timeline";

export default function CommunityTimeline() {
  const [months, setMonths] = useState<TimelineMonths>(3);
  const selection = timelinePeriods.find((period) => period.months === months)!;
  const live = useAtomValue(liveAtom);
  const reduce = useReducedMotion();
  const clock = useQuery({
    queryKey: ["landing", "timeline-range", months],
    queryFn: () => timelineRange(months),
    initialData: () => timelineRange(months),
    refetchInterval: 60_000,
  });
  const range = clock.data;
  const daily = useQuery({
    queryKey: ["landing", "scrobbles-over-time", range.from, range.to],
    queryFn: async () => {
      const response = await client.scrobblesChart(range);
      return timelinePoints(response.scrobbles ?? [], range);
    },
    staleTime: 300_000,
    refetchInterval: live ? 300_000 : false,
  });
  const points = daily.data ?? [];
  const hasData = points.some((point) => point.count > 0);
  return (
    <section
      className="container community-timeline"
      aria-labelledby="community-timeline-title"
    >
      <div className="community-timeline-heading">
        <div>
          <h2 id="community-timeline-title">Scrobbles over time</h2>
          <p>Daily listening across all of Rocksky.</p>
        </div>
        <select
          className="community-timeline-period"
          aria-label="Scrobbles date range"
          value={months}
          onChange={(event) => {
            const period = timelinePeriods.find(
              (period) => period.months === Number(event.currentTarget.value),
            );
            if (period) setMonths(period.months);
          }}
        >
          {timelinePeriods.map((period) => (
            <option key={period.months} value={period.months}>
              {period.label}
            </option>
          ))}
        </select>
      </div>
      {daily.isPending ? (
        <div className="community-timeline-state" role="status">
          Loading community listening…
        </div>
      ) : hasData ? (
        <div
          role="group"
          aria-label={`Daily global scrobbles over the ${selection.label.toLowerCase()}`}
        >
          <ScrobblesTimeline points={points} animate={!reduce} />
        </div>
      ) : (
        <div className="community-timeline-state" role="status">
          <p>
            {daily.isError
              ? "The listening chart couldn’t load."
              : "No scrobbles in this period yet."}
          </p>
          {daily.isError && (
            <button type="button" onClick={() => void daily.refetch()}>
              Try again
            </button>
          )}
        </div>
      )}
      {daily.isError && hasData && (
        <p className="community-timeline-stale" role="status">
          Showing the last available chart.{" "}
          <button type="button" onClick={() => void daily.refetch()}>
            Retry
          </button>
        </p>
      )}
    </section>
  );
}
