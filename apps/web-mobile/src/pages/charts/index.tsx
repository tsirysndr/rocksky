import ContentLoader from "react-content-loader";
import { Link } from "react-router-dom";
import { useState } from "react";
import Main from "../../layouts/Main";
import { useTopArtistsQuery, useTopTracksQuery } from "../../hooks/useLibrary";

function TrackItem({
  rank,
  item,
}: {
  rank: number;
  item: Record<string, unknown>;
}) {
  const title = (item.title || item.name) as string;
  const artist = item.artist as string;
  const cover = (item.albumArt || item.cover) as string;
  const uri = item.uri as string;
  const playCount = (item.playCount || item.scrobbles || 0) as number;

  const href = uri
    ? `/${uri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;

  return (
    <div className="flex items-center gap-3 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
      <span className="w-7 text-center text-sm font-bold opacity-40" style={{ color: "var(--color-text)" }}>
        {rank}
      </span>
      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
        {cover ? (
          <img src={cover} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xl opacity-20">♪</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link to={href} className="no-underline block font-semibold text-sm truncate" style={{ color: "var(--color-text)" }}>
            {title}
          </Link>
        ) : (
          <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{title}</p>
        )}
        {artist && (
          <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{artist}</p>
        )}
      </div>
      {playCount > 0 && (
        <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
          {playCount.toLocaleString()}
        </span>
      )}
    </div>
  );
}

function ArtistItem({ rank, item }: { rank: number; item: Record<string, unknown> }) {
  const name = item.name as string;
  const picture = item.picture as string;
  const uri = item.uri as string;
  const playCount = (item.playCount || item.scrobbles || 0) as number;

  const href = uri ? `/${uri.split("at://")[1].replace("app.rocksky.", "")}` : null;

  return (
    <div className="flex items-center gap-3 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
      <span className="w-7 text-center text-sm font-bold opacity-40" style={{ color: "var(--color-text)" }}>
        {rank}
      </span>
      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
        {picture ? (
          <img src={picture} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xl opacity-20">♬</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link to={href} className="no-underline font-semibold text-sm truncate block" style={{ color: "var(--color-text)" }}>
            {name}
          </Link>
        ) : (
          <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{name}</p>
        )}
      </div>
      {playCount > 0 && (
        <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
          {playCount.toLocaleString()}
        </span>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="px-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <ContentLoader
          key={i}
          width="100%"
          height={64}
          viewBox="0 0 350 64"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          <circle cx="42" cy="32" r="24" />
          <rect x="76" y="18" rx="4" ry="4" width="160" height="12" />
          <rect x="76" y="38" rx="4" ry="4" width="100" height="10" />
        </ContentLoader>
      ))}
    </div>
  );
}

export default function Charts() {
  const [tab, setTab] = useState<"tracks" | "artists">("tracks");
  const { data: tracks, isLoading: tracksLoading } = useTopTracksQuery(0, 50);
  const { data: artists, isLoading: artistsLoading } = useTopArtistsQuery(0, 50);

  const loading = tab === "tracks" ? tracksLoading : artistsLoading;

  return (
    <Main>
      <div className="pt-4 pb-6">
        <h1 className="px-4 text-2xl font-bold m-0 mb-4" style={{ color: "var(--color-text)" }}>
          Charts
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 px-4 mb-4">
          {(["tracks", "artists"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-sm font-medium px-4 py-1.5 rounded-full border-none cursor-pointer capitalize"
              style={{
                backgroundColor: tab === t ? "var(--color-primary)" : "var(--color-surface-2)",
                color: tab === t ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {loading && <ListSkeleton />}

        {!loading && tab === "tracks" && (
          <div className="px-4">
            {(tracks?.tracks || []).map((item: Record<string, unknown>, i: number) => (
              <TrackItem key={String(item.id || i)} rank={i + 1} item={item} />
            ))}
          </div>
        )}

        {!loading && tab === "artists" && (
          <div className="px-4">
            {(artists?.artists || []).map((item: Record<string, unknown>, i: number) => (
              <ArtistItem key={String(item.id || i)} rank={i + 1} item={item} />
            ))}
          </div>
        )}
      </div>
    </Main>
  );
}
