import styled from "@emotion/styled";
import { uriToPath } from "../../lib/uri";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { Link as DefaultLink, useParams } from "@tanstack/react-router";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import {
  HeadingMedium,
  LabelLarge,
  LabelMedium,
  LabelXSmall,
} from "baseui/typography";
import dayjs from "dayjs";
import numeral from "numeral";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { AddToPlaylistButton } from "../../components/AddToPlaylistPalette";
import BackButton from "../../components/BackButton";
import LikeButton from "../../components/LikeButton";
import { PillLink } from "../../components/PillButton";
import ShareOnBluesky from "../../components/ShareOnBluesky";
import Disc from "../../components/Icons/Disc";
import Shout from "../../components/Shout/Shout";
import { useTimeFormat } from "../../hooks/useFormat";
import { useAlbumQuery } from "../../hooks/useLibrary";
import SongCover from "../../components/SongCover";
import Main from "../../layouts/Main";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
`;

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

// Plus and heart sit next to each other, so these cells drop baseui's
// horizontal cell padding. The first one keeps its left padding to stay clear
// of the duration.
const ACTION_CELL = {
  TableBodyCell: {
    style: {
      width: "36px",
      paddingLeft: "0px",
      paddingRight: "0px",
      verticalAlign: "middle",
    },
  },
};

const FIRST_ACTION_CELL = {
  TableBodyCell: {
    style: {
      width: "52px",
      paddingLeft: "16px",
      paddingRight: "0px",
      verticalAlign: "middle",
    },
  },
};

type Row = {
  id: string;
  title: string;
  artist: string;
  albumArtist: string;
  albumArt: string;
  albumUri: string;
  artistUri: string;
  scrobbleUri: string;
  duration: number;
  trackNumber: number;
  uri: string;
  liked: boolean;
};

const Album = () => {
  const { formatTime } = useTimeFormat();
  const { did, rkey } = useParams({ strict: false });
  const { data, isLoading, isError } = useAlbumQuery(did!, rkey!);

  const [disc, setDisc] = useState(1);
  const [album, setAlbum] = useState<{
    id: string;
    albumArt?: string;
    artist: string;
    title: string;
    year: number;
    uri: string;
    releaseDate: string;
    listeners: number;
    scrobbles: number;
    artistUri?: string;
    label?: string;
    tags?: string[];
    tracks: {
      id: string;
      trackNumber: number;
      album: string;
      albumArt: string;
      albumArtist: string;
      title: string;
      artist: string;
      createdAt: string;
      uri: string;
      albumUri: string;
      artistUri: string;
      duration: number;
      discNumber: number;
      liked: boolean;
    }[];
  } | null>(null);
  const uri = `${did}/app.rocksky.album/${rkey}`;

  useEffect(() => {
    if (!isLoading && !isError && data) {
      const tracks = data.tracks ?? [];
      setAlbum({
        id: data.id ?? "",
        albumArt: data.albumArt,
        artistUri: data.artistUri,
        artist: data.artist ?? "",
        title: data.title ?? "",
        year: data.year ?? 0,
        uri: data.uri ?? "",
        listeners: data.uniqueListeners ?? 0,
        scrobbles: data.playCount ?? 0,
        tags: data.tags,
        tracks: tracks.map((track) => ({
          id: track.id ?? "",
          trackNumber: track.trackNumber ?? 0,
          album: track.album ?? "",
          albumArt: track.albumArt ?? "",
          albumArtist: track.albumArtist ?? "",
          title: track.title ?? "",
          artist: track.artist ?? "",
          createdAt: track.createdAt ?? "",
          uri: track.uri ?? "",
          albumUri: track.albumUri ?? "",
          artistUri: track.artistUri ?? "",
          duration: track.duration ?? 0,
          discNumber: track.discNumber ?? 1,
          liked: track.liked ?? false,
        })),
        releaseDate: data.releaseDate
          ? dayjs(data.releaseDate).format("MMMM D, YYYY")
          : (data.year?.toString() ?? ""),
        label: tracks[0]?.copyrightMessage || tracks[0]?.label,
      });
      setDisc(Math.max(...tracks.map((track) => track.discNumber ?? 1)));
    }
  }, [data, isLoading, isError]);

  return (
    <Main>
      <div className="pb-[100px] pt-[50px]">
        <BackButton />
        {!album && (
          <div className="mt-[-50px]">
            <ContentLoader
              width="100%"
              height={600}
              viewBox="0 0 900 600"
              backgroundColor="var(--color-skeleton-background)"
              foregroundColor="var(--color-skeleton-foreground)"
            >
              {/* Album cover */}
              <rect x="0" y="20" rx="8" ry="8" width="240" height="240" />

              {/* Album title */}
              <rect x="270" y="20" rx="4" ry="4" width="350" height="28" />

              {/* Artist name */}
              <rect x="270" y="65" rx="3" ry="3" width="220" height="20" />

              {/* Listeners label */}
              <rect x="270" y="120" rx="3" ry="3" width="80" height="12" />
              {/* Listeners count */}
              <rect x="270" y="140" rx="3" ry="3" width="100" height="18" />

              {/* Scrobbles label */}
              <rect x="390" y="120" rx="3" ry="3" width="80" height="12" />
              {/* Scrobbles count */}
              <rect x="390" y="140" rx="3" ry="3" width="100" height="18" />

              {/* View on PDSls button */}
              <rect x="700" y="125" rx="8" ry="8" width="180" height="48" />

              {/* Genre tags */}
              <rect x="270" y="185" rx="3" ry="3" width="60" height="14" />
              <rect x="340" y="185" rx="3" ry="3" width="70" height="14" />
              <rect x="420" y="185" rx="3" ry="3" width="55" height="14" />

              {/* Track list rows */}
              {/* Row 1 */}
              <rect x="0" y="300" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="300" rx="3" ry="3" width="500" height="15" />
              <rect x="800" y="300" rx="3" ry="3" width="60" height="15" />

              {/* Row 2 */}
              <rect x="0" y="350" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="350" rx="3" ry="3" width="500" height="15" />
              <rect x="800" y="350" rx="3" ry="3" width="60" height="15" />

              {/* Row 3 */}
              <rect x="0" y="400" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="400" rx="3" ry="3" width="500" height="15" />
              <rect x="800" y="400" rx="3" ry="3" width="60" height="15" />

              {/* Row 4 */}
              <rect x="0" y="450" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="450" rx="3" ry="3" width="500" height="15" />
              <rect x="800" y="450" rx="3" ry="3" width="60" height="15" />

              {/* Row 5 */}
              <rect x="0" y="500" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="500" rx="3" ry="3" width="500" height="15" />
              <rect x="800" y="500" rx="3" ry="3" width="60" height="15" />

              {/* Row 6 */}
              <rect x="0" y="550" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="550" rx="3" ry="3" width="500" height="15" />
              <rect x="800" y="550" rx="3" ry="3" width="60" height="15" />
            </ContentLoader>
          </div>
        )}
        {album && (
          <Group>
            {album.albumArt && <SongCover cover={album.albumArt!} size={210} />}
            {!album.albumArt && (
              <div className="w-[210px] h-[210px] mr-[12px] rounded-[8px] bg-[rgba(243, 243, 243, 0.725)] flex justify-center items-center">
                <div className="w-[165px] h-[165px]">
                  <Disc color="rgba(66, 87, 108, 0.65)" />
                </div>
              </div>
            )}
            <div className="ml-[20px] flex-1">
              <HeadingMedium margin={0} className="!text-[var(--color-text)]">
                {album.title}
              </HeadingMedium>
              {album.artistUri && (
                <Link to={uriToPath(album.artistUri)}>
                  <LabelLarge margin={0} className="!text-[var(--color-text)]">
                    {album.artist}
                  </LabelLarge>
                </Link>
              )}
              {!album.artistUri && (
                <LabelLarge margin={0} className="!text-[var(--color-text)]">
                  {album.artist}
                </LabelLarge>
              )}
              <div className="mt-[20px] flex flex-row">
                <div
                  style={{
                    marginRight: 20,
                  }}
                >
                  <LabelMedium
                    margin={0}
                    className="!text-[var(--color-text-muted)]"
                  >
                    Listeners
                  </LabelMedium>
                  <LabelLarge
                    margin={0}
                    className="!text-[var(--color-text)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {numeral(album.listeners).format("0,0")}
                  </LabelLarge>
                </div>
                <div>
                  <LabelMedium
                    margin={0}
                    className="!text-[var(--color-text-muted)]"
                  >
                    Scrobbles
                  </LabelMedium>
                  <LabelLarge
                    margin={0}
                    className="!text-[var(--color-text)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {numeral(album.scrobbles || 1).format("0,0")}
                  </LabelLarge>
                </div>
              </div>
              <div className="flex items-center gap-[12px] mt-[20px]">
                <PillLink
                  href={`https://pdsls.dev/at/${uri.replace("at://", "")}`}
                  target="_blank"
                >
                  <ExternalLink size={16} />
                  View on PDSls
                </PillLink>
                <ShareOnBluesky
                  text={`${album?.title} by ${album?.artist} on Rocksky 🎵\n${window.location.href}`}
                />
              </div>
              <div className="mt-[10px]">
                {(album?.tags || []).map((genre) => (
                  <Link
                    to={`/genre/${genre}` as string}
                    className="mr-[15px] !text-[var(--color-genre)] text-[13px] !no-underline"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    # {genre}
                  </Link>
                ))}
              </div>
            </div>
          </Group>
        )}

        <div className="mt-[20px]">
          {disc < 2 && (
            <TableBuilder
              data={album?.tracks}
              emptyMessage="You haven't listened to any music yet."
              divider="clean"
              overrides={{
                TableHeadRow: {
                  style: {
                    display: "none",
                  },
                },
                TableBodyCell: {
                  style: {
                    verticalAlign: "middle",
                  },
                },
                TableBodyRow: {
                  style: {
                    backgroundColor: "var(--color-background)",
                    ":hover": {
                      backgroundColor: "var(--color-menu-hover)",
                    },
                  },
                },
                Table: {
                  style: {
                    backgroundColor: "var(--color-background)",
                  },
                },
              }}
            >
              <TableBuilderColumn
                header="Track"
                overrides={{
                  TableBodyCell: {
                    style: {
                      width: "50px",
                      verticalAlign: "middle",
                    },
                  },
                }}
              >
                {(row: Row) => (
                  <div className="!text-[var(--color-text)] flex flex-row items-center flex-1">
                    {row.trackNumber}
                  </div>
                )}
              </TableBuilderColumn>
              <TableBuilderColumn
                header="Title"
                overrides={{
                  TableBodyCell: {
                    style: {
                      width: "100%",
                      maxWidth: 0,
                    },
                  },
                }}
              >
                {(row: Row) => (
                  <div className="flex flex-row items-center min-w-0">
                    <div className="min-w-0">
                      <div>
                        {row.uri && (
                          <Link
                            to={uriToPath(row.uri)}
                            className="!text-[var(--color-text)] block truncate"
                          >
                            {row.title}
                          </Link>
                        )}
                        {!row.uri && (
                          <div className="!text-[var(--color-text)] truncate">
                            {row.title}
                          </div>
                        )}
                      </div>
                      <div>
                        {row.artistUri && (
                          <Link
                            to={uriToPath(row.artistUri)}
                            className="!text-[var(--color-text-muted)] block truncate"
                          >
                            {row.albumArtist}
                          </Link>
                        )}
                        {!row.artistUri && (
                          <div className="!text-[var(--color-text-muted)] truncate">
                            {row.albumArtist}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TableBuilderColumn>
              <TableBuilderColumn header="Duration">
                {(row: Row) => (
                  <div style={{ fontFamily: "var(--font-mono)" }}>
                    {formatTime(row.duration)}
                  </div>
                )}
              </TableBuilderColumn>
              <TableBuilderColumn
                header=""
                overrides={FIRST_ACTION_CELL}
              >
                {(row: Row) => (
                  <AddToPlaylistButton uri={row.uri} title={row.title} />
                )}
              </TableBuilderColumn>
              <TableBuilderColumn
                header=""
                overrides={ACTION_CELL}
              >
                {(row: Row) => <LikeButton uri={row.uri} liked={row.liked} />}
              </TableBuilderColumn>
            </TableBuilder>
          )}
          {disc > 1 && (
            <div>
              {[...Array(disc)].map((_, i) => (
                <div className="mt-[20px]" key={i}>
                  <LabelLarge className="!text-[var(--color-text)]">
                    Volume {i + 1}
                  </LabelLarge>
                  <TableBuilder
                    data={album?.tracks.filter((x) => x.discNumber == i + 1)}
                    emptyMessage="You haven't listened to any music yet."
                    divider="clean"
                    overrides={{
                      TableHeadRow: {
                        style: {
                          display: "none",
                        },
                      },
                      TableBodyCell: {
                        style: {
                          verticalAlign: "middle",
                        },
                      },
                      TableBodyRow: {
                        style: {
                          backgroundColor: "var(--color-background)",
                          ":hover": {
                            backgroundColor: "var(--color-menu-hover)",
                          },
                        },
                      },
                    }}
                  >
                    <TableBuilderColumn
                      header="Track"
                      overrides={{
                        TableBodyCell: {
                          style: {
                            width: "50px",
                            verticalAlign: "middle",
                          },
                        },
                      }}
                    >
                      {(row: Row) => (
                        <div className="flex flex-row items-center flex-1 text-[var(--color-text)]">
                          {row.trackNumber}
                        </div>
                      )}
                    </TableBuilderColumn>
                    <TableBuilderColumn
                      header="Title"
                      overrides={{
                        TableBodyCell: {
                          style: {
                            width: "100%",
                            maxWidth: 0,
                          },
                        },
                      }}
                    >
                      {(row: Row) => (
                        <div className="flex flex-row items-center flex-1 w-full min-w-0">
                          <div className="min-w-0">
                            <div>
                              {row.uri && (
                                <Link
                                  to={uriToPath(row.uri)}
                                  className="!text-[var(--color-text)] block truncate"
                                >
                                  {row.title}
                                </Link>
                              )}
                              {!row.uri && (
                                <div className="!text-[var(--color-text)] truncate">
                                  {row.title}
                                </div>
                              )}
                            </div>
                            <div>
                              {row.artistUri && (
                                <Link
                                  to={uriToPath(row.artistUri)}
                                  className="!text-[var(--color-text-muted)] block truncate"
                                >
                                  {row.albumArtist}
                                </Link>
                              )}
                              {!row.artistUri && (
                                <div className="!text-[var(--color-text-muted)] truncate">
                                  {row.albumArtist}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </TableBuilderColumn>
                    <TableBuilderColumn header="Duration">
                      {(row: Row) => (
                        <div
                          className="w-[80px] text-[var(--color-text)]"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {formatTime(row.duration)}
                        </div>
                      )}
                    </TableBuilderColumn>
                    <TableBuilderColumn
                      header=""
                      overrides={FIRST_ACTION_CELL}
                    >
                      {(row: Row) => (
                        <AddToPlaylistButton uri={row.uri} title={row.title} />
                      )}
                    </TableBuilderColumn>
                    <TableBuilderColumn
                      header=""
                      overrides={ACTION_CELL}
                    >
                      {(row: Row) => (
                        <LikeButton uri={row.uri} liked={row.liked} />
                      )}
                    </TableBuilderColumn>
                  </TableBuilder>
                </div>
              ))}
            </div>
          )}

          <div className="mt-[20px]">
            <LabelMedium
              margin={0}
              className="!text-[var(--color-text-muted)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {album?.releaseDate}
            </LabelMedium>
            <LabelXSmall margin={0} className="!text-[var(--color-text-muted)]">
              {album?.label}
            </LabelXSmall>
          </div>
        </div>
        <Shout type="album" />
      </div>
    </Main>
  );
};

export default Album;
