import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
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
import { Link as DefaultLink, useParams } from "react-router";
import Disc from "../../components/Icons/Disc";
import Shout from "../../components/Shout/Shout";
import SongCover from "../../components/SongCover";
import { useTimeFormat } from "../../hooks/useFormat";
import { useAlbumQuery } from "../../hooks/useLibrary";
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
};

const Album = () => {
  const { formatTime } = useTimeFormat();
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
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
    tracks: {
      xata_id: string;
      track_number: number;
      album: string;
      album_art: string;
      album_artist: string;
      title: string;
      artist: string;
      xata_created: string;
      uri: string;
      album_uri: string;
      artist_uri: string;
      duration: number;
      disc_number: number;
    }[];
  } | null>(null);
  const uri = `${did}/app.rocksky.album/${rkey}`;

  useEffect(() => {
    if (!isLoading && !isError) {
      setAlbum({
        id: data.id,
        albumArt: data.album_art,
        artistUri: data.artist_uri,
        artist: data.artist,
        title: data.title,
        year: data.year,
        uri: data.uri,
        listeners: data.listeners,
        scrobbles: data.scrobbles,
        tracks: data.tracks,
        releaseDate: data.release_date
          ? dayjs(data.release_date).format("MMMM D, YYYY")
          : data.year?.toString(),
        label: data.tracks[0].copyright_message || data.tracks[0].label,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDisc(Math.max(...data.tracks.map((track: any) => track.disc_number)));
    }
  }, [data, isLoading, isError]);

  return (
    <Main>
      <div className="pb-[100px] pt-[50px]">
        {!album && (
          <ContentLoader
            backgroundColor="var(--color-skeleton-background)"
            foregroundColor="var(--color-skeleton-foreground)"
            viewBox="100 0 850 700"
            height={520}
            width={700}
          >
            <rect x="400" y="21" rx="10" ry="10" width="694" height="20" />
            <rect x="400" y="61" rx="10" ry="10" width="80" height="20" />
            <rect x="500" y="-46" rx="3" ry="3" width="350" height="6" />
            <rect x="471" y="-45" rx="3" ry="3" width="380" height="6" />
            <rect x="484" y="-45" rx="3" ry="3" width="201" height="6" />
            <rect x="10" y="21" rx="8" ry="8" width="360" height="300" />
          </ContentLoader>
        )}
        {album && (
          <Group>
            {album.albumArt && <SongCover cover={album.albumArt!} />}
            {!album.albumArt && (
              <div className="w-[240px] h-[240px] mr-[12px] rounded-[8px] bg-[rgba(243, 243, 243, 0.725)] flex justify-center items-center">
                <div className="w-[130px] h-[130px]">
                  <Disc color="rgba(66, 87, 108, 0.65)" />
                </div>
              </div>
            )}
            <div className="ml-[20px] flex-1">
              <HeadingMedium margin={0} className="!text-[var(--color-text)]">
                {album.title}
              </HeadingMedium>
              {album.artistUri && (
                <Link to={`/${album.artistUri.split("at://")[1]}`}>
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
                  <LabelLarge margin={0} className="!text-[var(--color-text)]">
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
                  <LabelLarge margin={0} className="!text-[var(--color-text)]">
                    {numeral(album.scrobbles || 1).format("0,0")}
                  </LabelLarge>
                </div>
                <div className="flex items-center justify-end flex-1 mr-[10px]">
                  <a
                    href={`https://pdsls.dev/at/${uri}`}
                    target="_blank"
                    className="text-[var(--color-text)] no-underline bg-[var(--color-default-button)] rounded-[10px] p-[16px] pl-[25px] pr-[25px]"
                  >
                    <ExternalLink
                      size={24}
                      className="mr-[10px] text-[var(--color-text)]"
                    />
                    View on PDSls
                  </a>
                </div>
              </div>
            </div>
          </Group>
        )}

        <div className="mt-[20px]">
          {disc < 2 && (
            <TableBuilder
              data={album?.tracks.map((x) => ({
                id: x.xata_id,
                trackNumber: x.track_number,
                albumArt: x.album_art,
                title: x.title,
                artist: x.artist,
                uri: x.uri,
                albumUri: album?.uri,
                artistUri: x.artist_uri,
                albumArtist: x.album_artist,
                duration: x.duration,
                discNumber: x.disc_number,
              }))}
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
                    verticalAlign: "center",
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
                      verticalAlign: "center",
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
                    },
                  },
                }}
              >
                {(row: Row) => (
                  <div className="flex flex-row items-center">
                    <div>
                      <div>
                        {row.uri && (
                          <Link
                            to={`/${row.uri.split("at://")[1]}`}
                            className="!text-[var(--color-text)]"
                          >
                            {row.title}
                          </Link>
                        )}
                        {!row.uri && (
                          <div className="!text-[var(--color-text)]">
                            {row.title}
                          </div>
                        )}
                      </div>
                      <div>
                        {row.artistUri && (
                          <Link
                            to={`/${row.artistUri.split("at://")[1]}`}
                            className="!text-[var(--color-text-muted)]"
                          >
                            {row.albumArtist}
                          </Link>
                        )}
                        {!row.artistUri && (
                          <div className="!text-[var(--color-text-muted)]">
                            {row.albumArtist}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TableBuilderColumn>
              <TableBuilderColumn header="Duration">
                {(row: Row) => <div>{formatTime(row.duration)}</div>}
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
                    data={album?.tracks
                      .filter((x) => x.disc_number == i + 1)
                      .map((x) => ({
                        id: x.xata_id,
                        trackNumber: x.track_number,
                        albumArt: x.album_art,
                        title: x.title,
                        artist: x.artist,
                        uri: x.uri,
                        albumUri: album?.uri,
                        artistUri: x.artist_uri,
                        albumArtist: x.album_artist,
                        duration: x.duration,
                        discNumber: x.disc_number,
                      }))}
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
                          verticalAlign: "center",
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
                            verticalAlign: "center",
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
                          },
                        },
                      }}
                    >
                      {(row: Row) => (
                        <div className="flex flex-row items-center flex-1 w-full">
                          <div>
                            <div>
                              {row.uri && (
                                <Link
                                  to={`/${row.uri.split("at://")[1]}`}
                                  className="!text-[var(--color-text)]"
                                >
                                  {row.title}
                                </Link>
                              )}
                              {!row.uri && (
                                <div className="!text-[var(--color-text)]">
                                  {row.title}
                                </div>
                              )}
                            </div>
                            <div>
                              {row.artistUri && (
                                <Link
                                  to={`/${row.artistUri.split("at://")[1]}`}
                                  className="!text-[var(--color-text-muted)]"
                                >
                                  {row.albumArtist}
                                </Link>
                              )}
                              {!row.artistUri && (
                                <div className="!text-[var(--color-text-muted)]">
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
                        <div className="w-[80px] text-[var(--color-text)]">
                          {formatTime(row.duration)}
                        </div>
                      )}
                    </TableBuilderColumn>
                  </TableBuilder>
                </div>
              ))}
            </div>
          )}

          <div className="mt-[20px]">
            <LabelMedium margin={0} className="!text-[var(--color-text-muted)]">
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
