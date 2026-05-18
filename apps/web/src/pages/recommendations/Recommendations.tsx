import ContentLoader from "react-content-loader";
import styled from "@emotion/styled";
import { Link as DefaultLink } from "@tanstack/react-router";
import { HeadingMedium } from "baseui/typography";
import { Tab, Tabs } from "baseui/tabs-motion";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
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

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
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
  Table: { style: { backgroundColor: "var(--color-background)" } },
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

const EMPTY_MSG = "Scrobble more tracks to unlock personalised recommendations.";

function Recommendations() {
  const profile = useAtomValue(profileAtom);
  const [activeKey, setActiveKey] = useState<React.Key>("0");

  const did = profile?.did;
  const { data: tracks, isLoading: tracksLoading } =
    useTrackRecommendationsQuery(did);
  const { data: artists, isLoading: artistsLoading } =
    useArtistRecommendationsQuery(did);
  const { data: albums, isLoading: albumsLoading } =
    useAlbumRecommendationsQuery(did);

  const trackRows: TrackRow[] = (tracks ?? []).map((item, index) => ({
    ...item,
    index,
  }));
  const artistRows: ArtistRow[] = (artists ?? []).map((item, index) => ({
    ...item,
    index,
  }));
  const albumRows: AlbumRow[] = (albums ?? []).map((item, index) => ({
    ...item,
    index,
  }));

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
            {tracksLoading ? (
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
                    const href = row.trackUri
                      ? `/${row.trackUri.split("at://")[1]?.replace("app.rocksky.", "")}`
                      : null;
                    const artistHref = row.artistUri
                      ? `/${row.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}`
                      : null;
                    return (
                      <div className="flex flex-row items-center">
                        <div className="mr-[20px] text-[var(--color-text)]">
                          {row.index + 1}
                        </div>
                        {row.albumArt ? (
                          <img
                            src={row.albumArt}
                            alt={row.title}
                            className="w-[60px] h-[60px] mr-[20px] rounded-[5px]"
                          />
                        ) : (
                          <div className="w-[60px] h-[60px] rounded-[5px] mr-[20px] flex items-center justify-center bg-[var(--color-menu-hover)]">
                            <span className="text-xl opacity-20">♪</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          {href ? (
                            <Link
                              to={href as any}
                              className="!text-[var(--color-text)]"
                            >
                              {row.title}
                            </Link>
                          ) : (
                            <span style={{ color: "var(--color-text)" }}>
                              {row.title}
                            </span>
                          )}
                          {artistHref ? (
                            <Link
                              to={artistHref as any}
                              className="!text-[var(--color-text-muted)]"
                            >
                              {row.artist}
                            </Link>
                          ) : (
                            <span
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {row.artist}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }}
                </TableBuilderColumn>
                <TableBuilderColumn header="Source">
                  {(row: TrackRow) => <SourceBadge source={row.source} />}
                </TableBuilderColumn>
              </TableBuilder>
            )}
          </Tab>

          {/* ── Artists ── */}
          <Tab title="Artists" overrides={{ Tab: { style: TAB_STYLE } }}>
            {artistsLoading ? (
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
                    const href = row.uri
                      ? `/${row.uri.split("at://")[1]?.replace("app.rocksky.", "")}`
                      : null;
                    return (
                      <div className="flex flex-row items-center">
                        <div className="mr-[20px] text-[var(--color-text)]">
                          {row.index + 1}
                        </div>
                        {row.picture ? (
                          <img
                            src={row.picture}
                            alt={row.name}
                            className="w-[60px] h-[60px] rounded-full mr-[20px]"
                          />
                        ) : (
                          <div className="w-[60px] h-[60px] rounded-full mr-[20px] flex items-center justify-center bg-[var(--color-menu-hover)]">
                            <span className="text-xl opacity-20">♬</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          {href ? (
                            <Link
                              to={href as any}
                              className="!text-[var(--color-text)]"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <span style={{ color: "var(--color-text)" }}>
                              {row.name}
                            </span>
                          )}
                          {row.genres && row.genres.length > 0 && (
                            <span
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {row.genres.slice(0, 3).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }}
                </TableBuilderColumn>
                <TableBuilderColumn header="Source">
                  {(row: ArtistRow) => <SourceBadge source={row.source} />}
                </TableBuilderColumn>
              </TableBuilder>
            )}
          </Tab>

          {/* ── Albums ── */}
          <Tab title="Albums" overrides={{ Tab: { style: TAB_STYLE } }}>
            {albumsLoading ? (
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
                    const href = row.uri
                      ? `/${row.uri.split("at://")[1]?.replace("app.rocksky.", "")}`
                      : null;
                    const artistHref = row.artistUri
                      ? `/${row.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}`
                      : null;
                    return (
                      <div className="flex flex-row items-center">
                        <div className="mr-[20px] text-[var(--color-text)]">
                          {row.index + 1}
                        </div>
                        {row.albumArt ? (
                          <img
                            src={row.albumArt}
                            alt={row.title}
                            className="w-[60px] h-[60px] mr-[20px] rounded-[5px]"
                          />
                        ) : (
                          <div className="w-[60px] h-[60px] rounded-[5px] mr-[20px] flex items-center justify-center bg-[var(--color-menu-hover)]">
                            <span className="text-xl opacity-20">💿</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          {href ? (
                            <Link
                              to={href as any}
                              className="!text-[var(--color-text)]"
                            >
                              {row.title}
                            </Link>
                          ) : (
                            <span style={{ color: "var(--color-text)" }}>
                              {row.title}
                            </span>
                          )}
                          <div className="flex items-center gap-[6px]">
                            {artistHref ? (
                              <Link
                                to={artistHref as any}
                                className="!text-[var(--color-text-muted)]"
                              >
                                {row.artist}
                              </Link>
                            ) : (
                              <span
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                {row.artist}
                              </span>
                            )}
                            {row.year && (
                              <span
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
                <TableBuilderColumn header="Source">
                  {(row: AlbumRow) => <SourceBadge source={row.source} />}
                </TableBuilderColumn>
              </TableBuilder>
            )}
          </Tab>
        </Tabs>
      </div>
    </Main>
  );
}

export default Recommendations;
