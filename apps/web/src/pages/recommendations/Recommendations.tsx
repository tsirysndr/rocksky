import ContentLoader from "react-content-loader";
import { Link } from "@tanstack/react-router";
import { HeadingMedium } from "baseui/typography";
import { Tab, Tabs } from "baseui/tabs-motion";
import { useAtomValue } from "jotai";
import { useState } from "react";
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
      return { text: source === "neighbour" ? "Neighbour pick" : "Known artist", color: "#16a34a" };
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
      className="text-[11px] font-semibold px-[7px] py-[2px] rounded-full"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {text}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }).map((_, i) => (
        <ContentLoader
          key={i}
          width="100%"
          height={70}
          viewBox="0 0 700 70"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          <rect x="0" y="13" rx="6" ry="6" width="44" height="44" />
          <rect x="60" y="16" rx="4" ry="4" width="240" height="14" />
          <rect x="60" y="38" rx="4" ry="4" width="160" height="11" />
          <rect x="560" y="22" rx="10" ry="10" width="100" height="18" />
        </ContentLoader>
      ))}
    </div>
  );
}

function TrackRow({ item }: { item: TrackRecommendation }) {
  const href = item.trackUri
    ? `/${item.trackUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;
  const artistHref = item.artistUri
    ? `/${item.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="w-11 h-11 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
        style={{ backgroundColor: "var(--color-menu-hover)" }}
      >
        {item.albumArt ? (
          <img src={item.albumArt} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl opacity-20">♪</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link to={href as any} className="no-underline block font-semibold text-[14px] truncate !text-[var(--color-text)]">
            {item.title}
          </Link>
        ) : (
          <p className="font-semibold text-[14px] truncate m-0" style={{ color: "var(--color-text)" }}>{item.title}</p>
        )}
        <div className="flex items-center gap-1">
          {artistHref ? (
            <Link to={artistHref as any} className="no-underline text-[12px] truncate !text-[var(--color-text-muted)]">
              {item.artist}
            </Link>
          ) : (
            <span className="text-[12px] truncate" style={{ color: "var(--color-text-muted)" }}>{item.artist}</span>
          )}
          {item.album && (
            <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              — {item.album}
            </span>
          )}
        </div>
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
      className="flex items-center gap-3 py-3 border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
        style={{ backgroundColor: "var(--color-menu-hover)" }}
      >
        {item.picture ? (
          <img src={item.picture} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl opacity-20">♬</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link to={href as any} className="no-underline font-semibold text-[14px] truncate block !text-[var(--color-text)]">
            {item.name}
          </Link>
        ) : (
          <p className="font-semibold text-[14px] truncate m-0" style={{ color: "var(--color-text)" }}>{item.name}</p>
        )}
        {item.genres && item.genres.length > 0 && (
          <p className="text-[12px] truncate m-0" style={{ color: "var(--color-text-muted)" }}>
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
  const artistHref = item.artistUri
    ? `/${item.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="w-11 h-11 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
        style={{ backgroundColor: "var(--color-menu-hover)" }}
      >
        {item.albumArt ? (
          <img src={item.albumArt} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl opacity-20">💿</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {href ? (
          <Link to={href as any} className="no-underline font-semibold text-[14px] truncate block !text-[var(--color-text)]">
            {item.title}
          </Link>
        ) : (
          <p className="font-semibold text-[14px] truncate m-0" style={{ color: "var(--color-text)" }}>{item.title}</p>
        )}
        <div className="flex items-center gap-1">
          {artistHref ? (
            <Link to={artistHref as any} className="no-underline text-[12px] !text-[var(--color-text-muted)]">
              {item.artist}
            </Link>
          ) : (
            <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{item.artist}</span>
          )}
          {item.year && (
            <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              · {item.year}
            </span>
          )}
        </div>
      </div>
      <SourceBadge source={item.source} />
    </div>
  );
}

const TAB_STYLE = {
  color: "var(--color-text)",
  backgroundColor: "var(--color-background) !important",
};

function Recommendations() {
  const profile = useAtomValue(profileAtom);
  const [activeKey, setActiveKey] = useState<React.Key>("0");

  const did = profile?.did;
  const { data: tracks, isLoading: tracksLoading } = useTrackRecommendationsQuery(did);
  const { data: artists, isLoading: artistsLoading } = useArtistRecommendationsQuery(did);
  const { data: albums, isLoading: albumsLoading } = useAlbumRecommendationsQuery(did);

  return (
    <Main>
      <div className="mt-[60px] mb-[100px]">
        <HeadingMedium
          marginTop="0px"
          marginBottom="35px"
          className="!text-[var(--color-text)]"
        >
          Recommendations
        </HeadingMedium>

        <Tabs
          activeKey={activeKey}
          onChange={({ activeKey }) => setActiveKey(activeKey)}
          overrides={{
            TabHighlight: { style: { backgroundColor: "var(--color-purple)" } },
            TabBorder: { style: { display: "none" } },
          }}
          activateOnFocus
        >
          <Tab
            title="Tracks"
            overrides={{ Tab: { style: TAB_STYLE } }}
          >
            {tracksLoading ? (
              <ListSkeleton />
            ) : (
              <div className="mt-[10px]">
                {(tracks ?? []).map((item, i) => (
                  <TrackRow key={item.trackUri ?? i} item={item} />
                ))}
                {(tracks ?? []).length === 0 && (
                  <p className="text-[var(--color-text-muted)]">
                    Scrobble more tracks to unlock personalised recommendations.
                  </p>
                )}
              </div>
            )}
          </Tab>

          <Tab
            title="Artists"
            overrides={{ Tab: { style: TAB_STYLE } }}
          >
            {artistsLoading ? (
              <ListSkeleton />
            ) : (
              <div className="mt-[10px]">
                {(artists ?? []).map((item, i) => (
                  <ArtistRow key={item.id ?? i} item={item} />
                ))}
                {(artists ?? []).length === 0 && (
                  <p className="text-[var(--color-text-muted)]">
                    Scrobble more tracks to unlock personalised recommendations.
                  </p>
                )}
              </div>
            )}
          </Tab>

          <Tab
            title="Albums"
            overrides={{ Tab: { style: TAB_STYLE } }}
          >
            {albumsLoading ? (
              <ListSkeleton />
            ) : (
              <div className="mt-[10px]">
                {(albums ?? []).map((item, i) => (
                  <AlbumRow key={item.id ?? i} item={item} />
                ))}
                {(albums ?? []).length === 0 && (
                  <p className="text-[var(--color-text-muted)]">
                    Scrobble more tracks to unlock personalised recommendations.
                  </p>
                )}
              </div>
            )}
          </Tab>
        </Tabs>
      </div>
    </Main>
  );
}

export default Recommendations;
