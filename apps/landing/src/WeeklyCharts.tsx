import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { ArrowUpRight, Disc3, Music2, UserRound, Users } from "lucide-react";
import { appUrl, client, liveAtom } from "./data";
import { periodStart, type ChartPeriod } from "./weekly";

const periods = [
  { id: "today", label: "Today", since: "Since midnight · your local time" },
  { id: "week", label: "This week", since: "Since Monday · your local time" },
  {
    id: "month",
    label: "This month",
    since: "Since the first of the month · your local time",
  },
  { id: "all", label: "All time", since: "Across all listening history" },
] as const;

type Entry = {
  id?: string;
  uri?: string;
  title: string;
  subtitle?: string;
  image?: string;
  listeners?: number;
  scrobbles?: number;
  href?: string;
};
type Kind = "tracks" | "albums" | "artists" | "listeners";

function entryUrl(uri?: string) {
  const match = uri?.match(
    /^at:\/\/([^/]+)\/app\.rocksky\.(song|album|artist)\/([^/]+)$/,
  );
  return match
    ? `${appUrl}/${encodeURIComponent(match[1])}/${match[2]}/${encodeURIComponent(match[3])}`
    : undefined;
}

function Chart({
  kind,
  startDate,
  period,
}: {
  kind: Kind;
  startDate: string | null;
  period: ChartPeriod;
}) {
  const live = useAtomValue(liveAtom);
  const query = useQuery({
    queryKey: ["landing", "charts", kind, period, startDate],
    queryFn: async (): Promise<Entry[]> => {
      const interval = startDate
        ? { startDate, endDate: new Date().toISOString() }
        : {};
      if (kind === "listeners") {
        return (await client.topScrobblers(5, 0, interval)).map((listener) => ({
          id: listener.did || listener.id,
          title: listener.displayName || listener.handle || "Rocksky listener",
          subtitle: listener.handle ? `@${listener.handle}` : undefined,
          image: listener.avatar,
          scrobbles: listener.scrobbles,
          href: listener.did
            ? `${appUrl}/${encodeURIComponent(listener.did)}`
            : undefined,
        }));
      }
      if (kind === "artists") {
        return (await client.topArtistsInterval(5, 0, interval)).map(
          (artist) => ({
            id: artist.id,
            uri: artist.uri,
            title: artist.name || "Unknown artist",
            image: artist.picture,
            listeners: artist.uniqueListeners,
          }),
        );
      }
      const items =
        kind === "tracks"
          ? await client.topTracksInterval(5, 0, interval)
          : await client.topAlbumsInterval(5, 0, interval);
      return items.map((item) => ({
        id: item.id,
        uri: item.uri,
        title:
          item.title || `Untitled ${kind === "tracks" ? "track" : "album"}`,
        subtitle: item.artist,
        image: item.albumArt,
        listeners: item.uniqueListeners,
      }));
    },
    staleTime: 300_000,
    refetchInterval: live ? 300_000 : false,
  });
  const Icon =
    kind === "listeners"
      ? Users
      : kind === "artists"
        ? UserRound
        : kind === "albums"
          ? Disc3
          : Music2;
  const title = `Top ${kind}`;
  const periodLabel = periods.find((item) => item.id === period)!.label;
  return (
    <article
      className={`weekly-chart weekly-${kind}`}
      aria-label={`${title}, ${periodLabel.toLowerCase()}`}
    >
      <div className="weekly-chart-heading">
        <h3>
          <Icon size={18} /> {title}
        </h3>
        <span>{periodLabel.toUpperCase()}</span>
      </div>
      {query.data?.length ? (
        <ol className="weekly-list">
          {query.data.map((entry, index) => {
            const href = entry.href || entryUrl(entry.uri);
            const count =
              kind === "listeners" ? entry.scrobbles : entry.listeners;
            const unit = kind === "listeners" ? "scrobble" : "listener";
            const content = (
              <>
                <span className="weekly-rank">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="weekly-art" aria-hidden="true">
                  <Icon size={18} />
                  {entry.image && (
                    <img
                      src={entry.image}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </span>
                <span className="weekly-entry-title">
                  <strong>{entry.title}</strong>
                  {entry.subtitle && <span>{entry.subtitle}</span>}
                </span>
                <span className="weekly-count">
                  {count === undefined ? "—" : count.toLocaleString()}
                  <span>{count === 1 ? unit : `${unit}s`}</span>
                </span>
              </>
            );
            return (
              <li key={entry.uri || entry.id || index}>
                {href ? (
                  <a href={href} className="weekly-entry">
                    {content}
                  </a>
                ) : (
                  <div className="weekly-entry">{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : query.isPending ? (
        <div
          className="weekly-loading"
          role="status"
          aria-label={`Loading ${title.toLowerCase()}`}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div className="weekly-skeleton" key={index}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : (
        <div className="weekly-empty" role="status">
          <Icon size={28} />
          <p>
            {query.isError
              ? "This chart is taking a break."
              : "A fresh chart, waiting for listens."}
          </p>
          {query.isError ? (
            <button type="button" onClick={() => void query.refetch()}>
              Try again
            </button>
          ) : (
            <span>Listens will appear here as they come in.</span>
          )}
        </div>
      )}
      {query.isError && !!query.data?.length && (
        <p className="weekly-stale" role="status">
          Showing the last available chart.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
    </article>
  );
}

export default function WeeklyCharts() {
  const [period, setPeriod] = useState<ChartPeriod>("week");
  // Refreshing the clock rolls the keys over at a new local day, week, or month.
  const clock = useQuery({
    queryKey: ["landing", "period-start", period],
    queryFn: () => periodStart(period),
    initialData: () => periodStart(period),
    refetchInterval: period === "all" ? false : 60_000,
  });
  const selection = periods.find((item) => item.id === period)!;
  return (
    <section id="this-week" className="container weekly-section section-space">
      <div className="section-heading weekly-heading">
        <div>
          <div className="eyebrow">03 / COMMUNITY CHARTS</div>
          <h2>
            On repeat.
            <br />
            <span className="muted-heading">Find your next favorite.</span>
          </h2>
        </div>
        <div className="weekly-intro">
          <p>
            The tracks, albums, and artists soundtracking the community. Ranked
            by unique listeners: each person counts once per track, album, or
            artist.
          </p>
          <span>{selection.since}</span>
          <a href={`${appUrl}/charts`}>
            Explore the charts <ArrowUpRight size={17} />
          </a>
        </div>
      </div>
      <div className="chart-periods" role="group" aria-label="Chart period">
        {periods.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={period === item.id}
            onClick={() => setPeriod(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="weekly-grid">
        {(["tracks", "albums", "artists", "listeners"] as const).map((kind) => (
          <Chart
            kind={kind}
            startDate={clock.data}
            period={period}
            key={kind}
          />
        ))}
      </div>
      <p className="chart-ranking-note">
        Music ranks by unique listeners. Top listeners ranks by scrobbles in the
        selected period.
      </p>
    </section>
  );
}
