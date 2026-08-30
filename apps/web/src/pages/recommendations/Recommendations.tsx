import ContentLoader from "react-content-loader";
import { uriToPath } from "../../lib/uri";
import styled from "@emotion/styled";
import { IconMusic } from "@tabler/icons-react";
import { Link as DefaultLink } from "@tanstack/react-router";
import { HeadingMedium } from "baseui/typography";
import { Tab, Tabs } from "baseui/tabs-motion";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
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

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &:hover {
    text-decoration: underline;
  }
`;

const Ellipsis = styled.span`
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TABLE_OVERRIDES = {
  TableHeadRow: { style: { display: "none" } },
  TableBodyCell: { style: { verticalAlign: "middle" } },
  TableBodyRow: {
    style: {
      backgroundColor: "var(--color-background)",
      ":hover": { backgroundColor: "var(--color-menu-hover)" },
    },
  },
  TableEmptyMessage: { style: { backgroundColor: "var(--color-background)" } },
  Table: {
    style: {
      backgroundColor: "var(--color-background)",
      tableLayout: "fixed",
      width: "100%",
    },
  },
};

// With table-layout: fixed, column widths come from the first rendered row
// (the head row is display: none), so pin the Source column via its body cells.
// Per-column overrides replace the table-level ones, so verticalAlign is
// duplicated here.
const SOURCE_COLUMN_OVERRIDES = {
  TableBodyCell: { style: { verticalAlign: "middle", width: "150px" } },
};

function sourceLabel(source?: string): { text: string; color: string } {
  switch (source) {
    case "neighbour":
    case "known-artist":
      return {
        text: source === "neighbour" ? "Neighbour pick" : "Known artist",
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
      className="text-[11px] font-semibold px-[7px] py-[2px] rounded-full whitespace-nowrap"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {text}
    </span>
  );
}

function TrackSkeleton() {
  return (
    <ContentLoader
      width="100%"
      height={480}
      viewBox="0 0 700 480"
      backgroundColor="var(--color-skeleton-background)"
      foregroundColor="var(--color-skeleton-foreground)"
    >
      <rect x="0" y="32" rx="3" ry="3" width="25" height="14" />
      <rect x="40" y="10" rx="4" ry="4" width="60" height="60" />
      <rect x="120" y="20" rx="3" ry="3" width="220" height="14" />
      <rect x="120" y="44" rx="3" ry="3" width="150" height="11" />
      <rect x="560" y="26" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="112" rx="3" ry="3" width="25" height="14" />
      <rect x="40" y="90" rx="4" ry="4" width="60" height="60" />
      <rect x="120" y="100" rx="3" ry="3" width="220" height="14" />
      <rect x="120" y="124" rx="3" ry="3" width="150" height="11" />
      <rect x="560" y="106" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="192" rx="3" ry="3" width="25" height="14" />
      <rect x="40" y="170" rx="4" ry="4" width="60" height="60" />
      <rect x="120" y="180" rx="3" ry="3" width="220" height="14" />
      <rect x="120" y="204" rx="3" ry="3" width="150" height="11" />
      <rect x="560" y="186" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="272" rx="3" ry="3" width="25" height="14" />
      <rect x="40" y="250" rx="4" ry="4" width="60" height="60" />
      <rect x="120" y="260" rx="3" ry="3" width="220" height="14" />
      <rect x="120" y="284" rx="3" ry="3" width="150" height="11" />
      <rect x="560" y="266" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="352" rx="3" ry="3" width="25" height="14" />
      <rect x="40" y="330" rx="4" ry="4" width="60" height="60" />
      <rect x="120" y="340" rx="3" ry="3" width="220" height="14" />
      <rect x="120" y="364" rx="3" ry="3" width="150" height="11" />
      <rect x="560" y="346" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="432" rx="3" ry="3" width="25" height="14" />
      <rect x="40" y="410" rx="4" ry="4" width="60" height="60" />
      <rect x="120" y="420" rx="3" ry="3" width="220" height="14" />
      <rect x="120" y="444" rx="3" ry="3" width="150" height="11" />
      <rect x="560" y="426" rx="10" ry="10" width="110" height="20" />
    </ContentLoader>
  );
}

function ArtistSkeleton() {
  return (
    <ContentLoader
      width="100%"
      height={480}
      viewBox="0 0 700 480"
      backgroundColor="var(--color-skeleton-background)"
      foregroundColor="var(--color-skeleton-foreground)"
    >
      <rect x="0" y="32" rx="3" ry="3" width="25" height="14" />
      <circle cx="70" cy="40" r="30" />
      <rect x="120" y="27" rx="3" ry="3" width="200" height="14" />
      <rect x="120" y="49" rx="3" ry="3" width="130" height="11" />
      <rect x="560" y="26" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="112" rx="3" ry="3" width="25" height="14" />
      <circle cx="70" cy="120" r="30" />
      <rect x="120" y="107" rx="3" ry="3" width="200" height="14" />
      <rect x="120" y="129" rx="3" ry="3" width="130" height="11" />
      <rect x="560" y="106" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="192" rx="3" ry="3" width="25" height="14" />
      <circle cx="70" cy="200" r="30" />
      <rect x="120" y="187" rx="3" ry="3" width="200" height="14" />
      <rect x="120" y="209" rx="3" ry="3" width="130" height="11" />
      <rect x="560" y="186" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="272" rx="3" ry="3" width="25" height="14" />
      <circle cx="70" cy="280" r="30" />
      <rect x="120" y="267" rx="3" ry="3" width="200" height="14" />
      <rect x="120" y="289" rx="3" ry="3" width="130" height="11" />
      <rect x="560" y="266" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="352" rx="3" ry="3" width="25" height="14" />
      <circle cx="70" cy="360" r="30" />
      <rect x="120" y="347" rx="3" ry="3" width="200" height="14" />
      <rect x="120" y="369" rx="3" ry="3" width="130" height="11" />
      <rect x="560" y="346" rx="10" ry="10" width="110" height="20" />

      <rect x="0" y="432" rx="3" ry="3" width="25" height="14" />
      <circle cx="70" cy="440" r="30" />
      <rect x="120" y="427" rx="3" ry="3" width="200" height="14" />
      <rect x="120" y="449" rx="3" ry="3" width="130" height="11" />
      <rect x="560" y="426" rx="10" ry="10" width="110" height="20" />
    </ContentLoader>
  );
}

const TAB_STYLE = {
  color: "var(--color-text)",
  backgroundColor: "var(--color-background) !important",
};

type TrackRow = TrackRecommendation & { index: number };
type ArtistRow = ArtistRecommendation & { index: number };
type AlbumRow = AlbumRecommendation & { index: number };

const EMPTY_MSG =
  "Scrobble more tracks to unlock personalised recommendations.";

const PAGE_SIZE = 25;

// The API returns the whole precomputed list at once (up to 100 rows), so
// "infinite scroll" is progressive reveal: render PAGE_SIZE more rows every
// time the sentinel under the table scrolls into view.
function useInfiniteReveal(total: number) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const done = visible >= total;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible((v) => v + PAGE_SIZE);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [done]);

  return { visible, done, sentinelRef };
}

function RevealSentinel({
  reveal,
}: {
  reveal: ReturnType<typeof useInfiniteReveal>;
}) {
  if (reveal.done) return null;
  return <div ref={reveal.sentinelRef} className="h-[1px]" />;
}

function Recommendations() {
  const profile = useAtomValue(profileAtom);
  const [activeKey, setActiveKey] = useState<React.Key>("0");
  const jwt = localStorage.getItem("token");

  const did = profile?.did;
  const {
    data: tracks,
    isLoading: tracksLoading,
    isFetching: tracksFetching,
  } = useTrackRecommendationsQuery(did);
  const {
    data: artists,
    isLoading: artistsLoading,
    isFetching: artistsFetching,
  } = useArtistRecommendationsQuery(did);
  const {
    data: albums,
    isLoading: albumsLoading,
    isFetching: albumsFetching,
  } = useAlbumRecommendationsQuery(did);

  const showTracksSkeleton =
    tracksLoading || (tracksFetching && !tracks?.length);
  const showArtistsSkeleton =
    artistsLoading || (artistsFetching && !artists?.length);
  const showAlbumsSkeleton =
    albumsLoading || (albumsFetching && !albums?.length);

  const tracksReveal = useInfiniteReveal(tracks?.length ?? 0);
  const artistsReveal = useInfiniteReveal(artists?.length ?? 0);
  const albumsReveal = useInfiniteReveal(albums?.length ?? 0);

  const trackRows: TrackRow[] = (tracks ?? [])
    .map((item, index) => ({ ...item, index }))
    .slice(0, tracksReveal.visible);
  const artistRows: ArtistRow[] = (artists ?? [])
    .map((item, index) => ({ ...item, index }))
    .slice(0, artistsReveal.visible);
  const albumRows: AlbumRow[] = (albums ?? [])
    .map((item, index) => ({ ...item, index }))
    .slice(0, albumsReveal.visible);

  if (!jwt) {
    return (
      <Main>
        <div className="mt-[60px] mb-[100px] flex flex-col items-center text-center">
          <HeadingMedium
            marginTop="0px"
            marginBottom="15px"
            className="!text-[var(--color-text)]"
          >
            Recommendations
          </HeadingMedium>
          <div className="text-[var(--color-text)] font-semibold">
            Sign in to see your personalised recommendations
          </div>
          <div className="text-[var(--color-text-muted)] mt-[8px]">
            Recommendations are based on your scrobble history.
          </div>
        </div>
      </Main>
    );
  }

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
          {/* ── Tracks ── */}
          <Tab title="Tracks" overrides={{ Tab: { style: TAB_STYLE } }}>
            {showTracksSkeleton ? (
              <TrackSkeleton />
            ) : (
              <TableBuilder
                data={trackRows}
                emptyMessage={EMPTY_MSG}
                divider="clean"
                overrides={TABLE_OVERRIDES}
              >
                <TableBuilderColumn header="Track">
                  {(row: TrackRow) => {
                    const href = row.trackUri ? uriToPath(row.trackUri) : null;
                    const artistHref = row.artistUri
                      ? uriToPath(row.artistUri)
                      : null;
                    return (
                      <div className="flex flex-row items-center min-w-0">
                        <div className="mr-[20px] text-[var(--color-text)]">
                          {row.index + 1}
                        </div>
                        {row.albumArt ? (
                          <img
                            src={row.albumArt}
                            alt={row.title}
                            className="w-[60px] h-[60px] mr-[20px] rounded-[5px] shrink-0"
                          />
                        ) : (
                          <div className="w-[60px] h-[60px] rounded-[5px] mr-[20px] flex items-center justify-center bg-[var(--color-menu-hover)] shrink-0">
                            <IconMusic size={20} className="opacity-20" />
                          </div>
                        )}
                        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                          {href ? (
                            <Link
                              to={href as any}
                              className="!text-[var(--color-text)]"
                            >
                              {row.title}
                            </Link>
                          ) : (
                            <Ellipsis style={{ color: "var(--color-text)" }}>
                              {row.title}
                            </Ellipsis>
                          )}
                          {artistHref ? (
                            <Link
                              to={artistHref as any}
                              className="!text-[var(--color-text-muted)]"
                            >
                              {row.artist}
                            </Link>
                          ) : (
                            <Ellipsis
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {row.artist}
                            </Ellipsis>
                          )}
                        </div>
                      </div>
                    );
                  }}
                </TableBuilderColumn>
                <TableBuilderColumn
                  header="Source"
                  overrides={SOURCE_COLUMN_OVERRIDES}
                >
                  {(row: TrackRow) => <SourceBadge source={row.source} />}
                </TableBuilderColumn>
              </TableBuilder>
            )}
            {!showTracksSkeleton && <RevealSentinel reveal={tracksReveal} />}
          </Tab>

          {/* ── Artists ── */}
          <Tab title="Artists" overrides={{ Tab: { style: TAB_STYLE } }}>
            {showArtistsSkeleton ? (
              <ArtistSkeleton />
            ) : (
              <TableBuilder
                data={artistRows}
                emptyMessage={EMPTY_MSG}
                divider="clean"
                overrides={TABLE_OVERRIDES}
              >
                <TableBuilderColumn header="Artist">
                  {(row: ArtistRow) => {
                    const href = row.uri ? uriToPath(row.uri) : null;
                    return (
                      <div className="flex flex-row items-center min-w-0">
                        <div className="mr-[20px] text-[var(--color-text)]">
                          {row.index + 1}
                        </div>
                        {row.picture ? (
                          <img
                            src={row.picture}
                            alt={row.name}
                            className="w-[60px] h-[60px] rounded-full mr-[20px] shrink-0"
                          />
                        ) : (
                          <div className="w-[60px] h-[60px] rounded-full mr-[20px] flex items-center justify-center bg-[var(--color-menu-hover)] shrink-0">
                            <span className="text-xl opacity-20">♬</span>
                          </div>
                        )}
                        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                          {href ? (
                            <Link
                              to={href as any}
                              className="!text-[var(--color-text)]"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <Ellipsis style={{ color: "var(--color-text)" }}>
                              {row.name}
                            </Ellipsis>
                          )}
                          {row.genres && row.genres.length > 0 && (
                            <Ellipsis
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {row.genres.slice(0, 3).join(", ")}
                            </Ellipsis>
                          )}
                        </div>
                      </div>
                    );
                  }}
                </TableBuilderColumn>
                <TableBuilderColumn
                  header="Source"
                  overrides={SOURCE_COLUMN_OVERRIDES}
                >
                  {(row: ArtistRow) => <SourceBadge source={row.source} />}
                </TableBuilderColumn>
              </TableBuilder>
            )}
            {!showArtistsSkeleton && <RevealSentinel reveal={artistsReveal} />}
          </Tab>

          {/* ── Albums ── */}
          <Tab title="Albums" overrides={{ Tab: { style: TAB_STYLE } }}>
            {showAlbumsSkeleton ? (
              <TrackSkeleton />
            ) : (
              <TableBuilder
                data={albumRows}
                emptyMessage={EMPTY_MSG}
                divider="clean"
                overrides={TABLE_OVERRIDES}
              >
                <TableBuilderColumn header="Album">
                  {(row: AlbumRow) => {
                    const href = row.uri ? uriToPath(row.uri) : null;
                    const artistHref = row.artistUri
                      ? uriToPath(row.artistUri)
                      : null;
                    return (
                      <div className="flex flex-row items-center min-w-0">
                        <div className="mr-[20px] text-[var(--color-text)]">
                          {row.index + 1}
                        </div>
                        {row.albumArt ? (
                          <img
                            src={row.albumArt}
                            alt={row.title}
                            className="w-[60px] h-[60px] mr-[20px] rounded-[5px] shrink-0"
                          />
                        ) : (
                          <div className="w-[60px] h-[60px] rounded-[5px] mr-[20px] flex items-center justify-center bg-[var(--color-menu-hover)] shrink-0">
                            <span className="text-xl opacity-20">💿</span>
                          </div>
                        )}
                        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                          {href ? (
                            <Link
                              to={href as any}
                              className="!text-[var(--color-text)]"
                            >
                              {row.title}
                            </Link>
                          ) : (
                            <Ellipsis style={{ color: "var(--color-text)" }}>
                              {row.title}
                            </Ellipsis>
                          )}
                          <div className="flex items-center gap-[6px] min-w-0">
                            {artistHref ? (
                              <Link
                                to={artistHref as any}
                                className="!text-[var(--color-text-muted)]"
                              >
                                {row.artist}
                              </Link>
                            ) : (
                              <Ellipsis
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                {row.artist}
                              </Ellipsis>
                            )}
                            {row.year && (
                              <span
                                className="whitespace-nowrap shrink-0"
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                · {row.year}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </TableBuilderColumn>
                <TableBuilderColumn
                  header="Source"
                  overrides={SOURCE_COLUMN_OVERRIDES}
                >
                  {(row: AlbumRow) => <SourceBadge source={row.source} />}
                </TableBuilderColumn>
              </TableBuilder>
            )}
            {!showAlbumsSkeleton && <RevealSentinel reveal={albumsReveal} />}
          </Tab>
        </Tabs>
      </div>
    </Main>
  );
}

export default Recommendations;
