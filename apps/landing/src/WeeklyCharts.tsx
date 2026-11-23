import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { ArrowUpRight, Disc3, Music2, UserRound } from "lucide-react";
import { appUrl, client, liveAtom } from "./data";
import { weekStart } from "./weekly";

type Entry = {
  id?: string;
  uri?: string;
  title: string;
  subtitle?: string;
  image?: string;
  listeners?: number;
};
type Kind = "tracks" | "albums" | "artists";

function entryUrl(uri?: string) {
  const match = uri?.match(
    /^at:\/\/([^/]+)\/app\.rocksky\.(song|album|artist)\/([^/]+)$/,
  );
  return match
    ? `${appUrl}/${encodeURIComponent(match[1])}/${match[2]}/${encodeURIComponent(match[3])}`
    : undefined;
}

function Chart({ kind, startDate }: { kind: Kind; startDate: string }) {
  const live = useAtomValue(liveAtom);
  const query = useQuery({
    queryKey: ["landing", "weekly", kind, startDate],
    queryFn: async (): Promise<Entry[]> => {
      const interval = { startDate, endDate: new Date().toISOString() };
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
    kind === "artists" ? UserRound : kind === "albums" ? Disc3 : Music2;
  const title = `Top ${kind}`;
  return (
    <article
      className={`weekly-chart weekly-${kind}`}
      aria-label={`${title} this week`}
    >
      <div className="weekly-chart-heading">
        <h3>
          <Icon size={18} /> {title}
        </h3>
        <span>THIS WEEK</span>
      </div>
      {query.data?.length ? (
        <ol className="weekly-list">
          {query.data.map((entry, index) => {
            const href = entryUrl(entry.uri);
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
                <span className="weekly-listeners">
                  {entry.listeners === undefined
                    ? "—"
                    : entry.listeners.toLocaleString()}
                  <span>
                    {entry.listeners === 1 ? "listener" : "listeners"}
                  </span>
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
              : "A new week, a fresh chart."}
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
  // The lightweight timer also rolls the query keys over at a new UTC week.
  const clock = useQuery({
    queryKey: ["landing", "week-start"],
    queryFn: () => weekStart(),
    initialData: () => weekStart(),
    refetchInterval: 60_000,
  });
  return (
    <section id="this-week" className="container weekly-section section-space">
      <div className="section-heading weekly-heading">
        <div>
          <div className="eyebrow">03 / THIS WEEK ON ROCKSKY</div>
          <h2>
            On repeat.
            <br />
            <span className="muted-heading">All week long.</span>
          </h2>
        </div>
        <div className="weekly-intro">
          <p>
            The tracks, albums, and artists soundtracking the community. Ranked
            by unique listeners: each person counts once per track, album, or
            artist.
          </p>
          <span>Since Monday · UTC</span>
          <a href={`${appUrl}/charts`}>
            Explore the charts <ArrowUpRight size={17} />
          </a>
        </div>
      </div>
      <div className="weekly-grid">
        {(["tracks", "albums", "artists"] as const).map((kind) => (
          <Chart kind={kind} startDate={clock.data} key={kind} />
        ))}
      </div>
    </section>
  );
}
