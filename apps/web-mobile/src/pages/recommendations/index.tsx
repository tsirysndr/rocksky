import ContentLoader from "react-content-loader";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useAtomValue } from "jotai";
import { profileAtom } from "../../atoms/profile";
import Main from "../../layouts/Main";
import {
  useAlbumRecommendationsQuery,
  useArtistRecommendationsQuery,
  useTrackRecommendationsQuery,
} from "../../hooks/useRecommendations";
import type {
  AlbumRecommendation,
  ArtistRecommendation,
  TrackRecommendation,
} from "../../api/recommendations";

function sourceLabel(source?: string): { text: string; color: string } {
  switch (source) {
    case "neighbour":
    case "known-artist":
      return { text: source === "neighbour" ? "Neighbour" : "Known artist", color: "#16a34a" };
    case "new-artist":
    case "social":
      return { text: source === "new-artist" ? "New artist" : "Social", color: "#2563eb" };
    case "serendipity":
      return { text: "Serendipity", color: "#7c3aed" };
    default:
      return { text: "For you", color: "var(--color-text-muted)" };
  }
}

function SourceBadge({ source }: { source?: string }) {
  const { text, color } = sourceLabel(source);
  return (
    <span
      className="text-[10px] font-semibold px-[6px] py-[2px] rounded-full shrink-0"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {text}
    </span>
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
          <rect x="0" y="10" rx="6" ry="6" width="44" height="44" />
          <rect x="56" y="14" rx="4" ry="4" width="160" height="12" />
          <rect x="56" y="34" rx="4" ry="4" width="100" height="10" />
          <rect x="270" y="18" rx="10" ry="10" width="80" height="18" />
        </ContentLoader>
      ))}
    </div>
  );
}

function TrackRow({ item }: { item: TrackRecommendation }) {
  const href = item.trackUri
    ? `/${item.trackUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b px-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="w-11 h-11 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-xl"
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        {item.albumArt ? (
          <img src={item.albumArt} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <span className="opacity-20">♪</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link to={href} className="no-underline block font-semibold text-sm truncate" style={{ color: "var(--color-text)" }}>
            {item.title}
          </Link>
        ) : (
          <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{item.title}</p>
        )}
        <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
          {item.artist}{item.album ? ` — ${item.album}` : ""}
        </p>
      </div>
      <SourceBadge source={item.source} />
    </div>
  );
}

function ArtistRow({ item }: { item: ArtistRecommendation }) {
  const href = item.uri
    ? `/${item.uri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b px-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xl"
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        {item.picture ? (
          <img src={item.picture} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="opacity-20">♬</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link to={href} className="no-underline font-semibold text-sm truncate block" style={{ color: "var(--color-text)" }}>
            {item.name}
          </Link>
        ) : (
          <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{item.name}</p>
        )}
        {item.genres && item.genres.length > 0 && (
          <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
            {item.genres.slice(0, 3).join(", ")}
          </p>
        )}
      </div>
      <SourceBadge source={item.source} />
    </div>
  );
}

function AlbumRow({ item }: { item: AlbumRecommendation }) {
  const href = item.uri
    ? `/${item.uri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b px-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="w-11 h-11 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-xl"
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        {item.albumArt ? (
          <img src={item.albumArt} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <span className="opacity-20">💿</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link to={href} className="no-underline font-semibold text-sm truncate block" style={{ color: "var(--color-text)" }}>
            {item.title}
          </Link>
        ) : (
          <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{item.title}</p>
        )}
        <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
          {item.artist}{item.year ? ` · ${item.year}` : ""}
        </p>
      </div>
      <SourceBadge source={item.source} />
    </div>
  );
}

export default function Recommendations() {
  const profile = useAtomValue(profileAtom);
  const jwt = localStorage.getItem("token");
  const [tab, setTab] = useState<"tracks" | "artists" | "albums">("tracks");

  const did = profile?.did;
  const { data: tracks, isLoading: tracksLoading } = useTrackRecommendationsQuery(did);
  const { data: artists, isLoading: artistsLoading } = useArtistRecommendationsQuery(did);
  const { data: albums, isLoading: albumsLoading } = useAlbumRecommendationsQuery(did);

  if (!profile || !jwt) {
    return (
      <Main>
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <p className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Sign in to see your personalised recommendations
          </p>
          <p className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
            Recommendations are based on your scrobble history.
          </p>
        </div>
      </Main>
    );
  }

  const loading =
    tab === "tracks" ? tracksLoading : tab === "artists" ? artistsLoading : albumsLoading;

  const empty =
    tab === "tracks"
      ? (tracks ?? []).length === 0
      : tab === "artists"
        ? (artists ?? []).length === 0
        : (albums ?? []).length === 0;

  return (
    <Main>
      <div className="pt-4 pb-6">
        <h1
          className="px-4 text-2xl font-bold m-0 mb-4"
          style={{ color: "var(--color-text)" }}
        >
          Recommendations
        </h1>

        <div className="flex gap-2 px-4 mb-4">
          {(["tracks", "artists", "albums"] as const).map((t) => (
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

        {!loading && empty && (
          <p className="px-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Scrobble more tracks to unlock personalised recommendations.
          </p>
        )}

        {!loading && !empty && tab === "tracks" && (
          <div>
            {(tracks ?? []).map((item, i) => (
              <TrackRow key={item.trackUri ?? i} item={item} />
            ))}
          </div>
        )}

        {!loading && !empty && tab === "artists" && (
          <div>
            {(artists ?? []).map((item, i) => (
              <ArtistRow key={item.id ?? i} item={item} />
            ))}
          </div>
        )}

        {!loading && !empty && tab === "albums" && (
          <div>
            {(albums ?? []).map((item, i) => (
              <AlbumRow key={item.id ?? i} item={item} />
            ))}
          </div>
        )}
      </div>
    </Main>
  );
}
