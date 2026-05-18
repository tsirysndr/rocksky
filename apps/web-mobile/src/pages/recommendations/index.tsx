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
      return {
        text: source === "neighbour" ? "Neighbour" : "Known artist",
        color: "#16a34a",
      };
    case "new-artist":
    case "social":
      return {
        text: source === "new-artist" ? "New artist" : "Social",
        color: "#2563eb",
      };
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
      className="text-[10px] font-semibold px-[6px] py-[2px] rounded-full shrink-0 whitespace-nowrap"
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
          <rect x="0" y="25" rx="3" ry="3" width="16" height="12" />
          <rect x="26" y="12" rx="4" ry="4" width="40" height="40" />
          <rect x="76" y="16" rx="3" ry="3" width="140" height="12" />
          <rect x="76" y="36" rx="3" ry="3" width="90" height="10" />
          <rect x="260" y="20" rx="10" ry="10" width="80" height="18" />
        </ContentLoader>
      ))}
    </div>
  );
}

function ArtistSkeleton() {
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
          <rect x="0" y="25" rx="3" ry="3" width="16" height="12" />
          <circle cx="46" cy="32" r="20" />
          <rect x="76" y="16" rx="3" ry="3" width="140" height="12" />
          <rect x="76" y="36" rx="3" ry="3" width="90" height="10" />
          <rect x="260" y="20" rx="10" ry="10" width="80" height="18" />
        </ContentLoader>
      ))}
    </div>
  );
}

function TrackRow({ item, index }: { item: TrackRecommendation; index: number }) {
  const href = item.trackUri
    ? `/${item.trackUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;
  const artistHref = item.artistUri
    ? `/${item.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b px-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span
        className="text-sm w-5 text-center shrink-0 opacity-40"
        style={{ color: "var(--color-text)" }}
      >
        {index + 1}
      </span>
      <div
        className="w-10 h-10 rounded-lg overflow-hidden shrink-0"
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        {item.albumArt ? (
          <img
            src={item.albumArt}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="opacity-20">♪</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link
            to={href}
            className="no-underline font-medium text-sm truncate block"
            style={{ color: "var(--color-text)" }}
          >
            {item.title}
          </Link>
        ) : (
          <p
            className="font-medium text-sm truncate m-0"
            style={{ color: "var(--color-text)" }}
          >
            {item.title}
          </p>
        )}
        {artistHref ? (
          <Link
            to={artistHref}
            className="no-underline text-xs truncate block"
            style={{ color: "var(--color-text-muted)" }}
          >
            {item.artist}
            {item.album ? ` — ${item.album}` : ""}
          </Link>
        ) : (
          <p
            className="text-xs truncate m-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            {item.artist}
            {item.album ? ` — ${item.album}` : ""}
          </p>
        )}
      </div>
      <SourceBadge source={item.source} />
    </div>
  );
}

function ArtistRow({ item, index }: { item: ArtistRecommendation; index: number }) {
  const href = item.uri
    ? `/${item.uri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b px-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span
        className="text-sm w-5 text-center shrink-0 opacity-40"
        style={{ color: "var(--color-text)" }}
      >
        {index + 1}
      </span>
      <div
        className="w-10 h-10 rounded-full overflow-hidden shrink-0"
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        {item.picture ? (
          <img
            src={item.picture}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="opacity-20">♬</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link
            to={href}
            className="no-underline font-medium text-sm truncate block"
            style={{ color: "var(--color-text)" }}
          >
            {item.name}
          </Link>
        ) : (
          <p
            className="font-medium text-sm truncate m-0"
            style={{ color: "var(--color-text)" }}
          >
            {item.name}
          </p>
        )}
        {item.genres && item.genres.length > 0 && (
          <p
            className="text-xs truncate m-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            {item.genres.slice(0, 3).join(", ")}
          </p>
        )}
      </div>
      <SourceBadge source={item.source} />
    </div>
  );
}

function AlbumRow({ item, index }: { item: AlbumRecommendation; index: number }) {
  const href = item.uri
    ? `/${item.uri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;
  const artistHref = item.artistUri
    ? `/${item.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b px-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span
        className="text-sm w-5 text-center shrink-0 opacity-40"
        style={{ color: "var(--color-text)" }}
      >
        {index + 1}
      </span>
      <div
        className="w-10 h-10 rounded-lg overflow-hidden shrink-0"
        style={{ backgroundColor: "var(--color-surface-2)" }}
      >
        {item.albumArt ? (
          <img
            src={item.albumArt}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="opacity-20">💿</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link
            to={href}
            className="no-underline font-medium text-sm truncate block"
            style={{ color: "var(--color-text)" }}
          >
            {item.title}
          </Link>
        ) : (
          <p
            className="font-medium text-sm truncate m-0"
            style={{ color: "var(--color-text)" }}
          >
            {item.title}
          </p>
        )}
        <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
          {artistHref ? (
            <Link
              to={artistHref}
              className="no-underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              {item.artist}
            </Link>
          ) : (
            item.artist
          )}
          {item.year ? ` · ${item.year}` : ""}
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
  const { data: tracks, isLoading: tracksLoading } =
    useTrackRecommendationsQuery(did);
  const { data: artists, isLoading: artistsLoading } =
    useArtistRecommendationsQuery(did);
  const { data: albums, isLoading: albumsLoading } =
    useAlbumRecommendationsQuery(did);

  if (!profile || !jwt) {
    return (
      <Main>
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <p
            className="text-lg font-semibold"
            style={{ color: "var(--color-text)" }}
          >
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
    tab === "tracks"
      ? tracksLoading
      : tab === "artists"
        ? artistsLoading
        : albumsLoading;

  const items =
    tab === "tracks"
      ? (tracks ?? [])
      : tab === "artists"
        ? (artists ?? [])
        : (albums ?? []);

  return (
    <Main>
      <div className="pt-4 pb-6">
        <h1
          className="px-4 text-2xl font-bold m-0 mb-4"
          style={{ color: "var(--color-text)" }}
        >
          Recommendations
        </h1>

        {/* Tabs */}
        <div className="flex border-b mb-0" style={{ borderColor: "var(--color-border)" }}>
          {(["tracks", "artists", "albums"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-3 text-sm font-medium border-none bg-transparent cursor-pointer capitalize"
              style={{
                color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
                borderBottom: `2px solid ${tab === t ? "var(--color-primary)" : "transparent"}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {loading && (tab === "artists" ? <ArtistSkeleton /> : <ListSkeleton />)}

        {!loading && items.length === 0 && (
          <p
            className="px-4 text-sm py-8 text-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            Scrobble more tracks to unlock personalised recommendations.
          </p>
        )}

        {!loading && items.length > 0 && tab === "tracks" && (
          <div>
            {(tracks ?? []).map((item, i) => (
              <TrackRow key={item.trackUri ?? i} item={item} index={i} />
            ))}
          </div>
        )}

        {!loading && items.length > 0 && tab === "artists" && (
          <div>
            {(artists ?? []).map((item, i) => (
              <ArtistRow key={item.id ?? i} item={item} index={i} />
            ))}
          </div>
        )}

        {!loading && items.length > 0 && tab === "albums" && (
          <div>
            {(albums ?? []).map((item, i) => (
              <AlbumRow key={item.id ?? i} item={item} index={i} />
            ))}
          </div>
        )}
      </div>
    </Main>
  );
}
