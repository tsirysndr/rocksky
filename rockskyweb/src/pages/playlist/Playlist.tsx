import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { Avatar } from "baseui/avatar";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingMedium, LabelMedium } from "baseui/typography";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { useParams } from "react-router";
import { Link as DefaultLink } from "react-router-dom";
import Disc from "../../components/Icons/Disc";
import SongCover from "../../components/SongCover";
import { useTimeFormat } from "../../hooks/useFormat";
import usePlaylists, { usePlaylistQuery } from "../../hooks/usePlaylists";
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
  index: number;
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

function Playlist() {
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const { formatTime } = useTimeFormat();
  const [playlist, setPlaylist] = useState<{
    id: string;
    name: string;
    picture: string;
    description?: string;
    uri?: string;
    spotifyLink?: string;
    tidalLink?: string;
    appleMusicLink?: string;
    curatedBy: {
      id: string;
      displayName: string;
      did: string;
      avatar: string;
      handle: string;
    };
    trackCount: number;
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
    }[];
  } | null>(null);
  usePlaylistQuery(did!, rkey!);
  const { getPlaylist } = usePlaylists();
  const uri = `${did}/app.rocksky.playlist/${rkey}`;

  useEffect(() => {
    if (!did || !rkey) {
      return;
    }
    const fetchPlaylist = async () => {
      const data = await getPlaylist(did, rkey);
      setPlaylist(data);
    };
    fetchPlaylist();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, rkey]);
  return (
    <Main>
      <div className="pb-[100px] pt-[50px]">
        {!playlist && (
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
        {playlist && (
          <>
            <Group>
              {playlist.picture && <SongCover cover={playlist.picture!} />}
              {!playlist.picture && (
                <div className="w-[240px] h-[240px] mr-[12px] rounded-[8px] bg-[rgba(243, 243, 243, 0.725)] flex justify-center items-center">
                  <div className="h-[130px] w-[130px]">
                    <Disc color="rgba(66, 87, 108, 0.65)" />
                  </div>
                </div>
              )}
              <div className="ml-[20px]">
                <HeadingMedium margin={0} className="!text-[var(--color-text)]">
                  {playlist.name}
                </HeadingMedium>
                <div className="mt-[10px]">
                  <LabelMedium className="!text-[var(--color-text-muted)]">
                    {playlist.tracks.length} Track
                    {playlist.tracks.length > 1 ? "s" : ""}
                  </LabelMedium>
                </div>
                <div className="mt-[40px]">
                  <LabelMedium className="!text-[var(--color-text-muted)]">
                    {playlist.description}
                  </LabelMedium>
                </div>
                <div className="flex items-center justify-end flex-1 mr-[10px]">
                  <a
                    href={`https://pdsls.dev/at/${uri}`}
                    target="_blank"
                    className="text-[var(--color-text)] no-underline p-[16px] bg-[var(--color-default-button)]  rounded-[10px] pl-[25px] pr-[25px]"
                  >
                    <ExternalLink size={24} className="mr-[10px]" />
                    View on PDSls
                  </a>
                </div>
              </div>
            </Group>

            <Group className="mb-[20px]">
              <Avatar
                name={playlist.curatedBy.displayName}
                src={playlist.curatedBy.avatar}
                size="45px"
              />
              <div className="ml-[10px]">
                <LabelMedium className="!text-[var(--color-text-muted)] uppercase text-[12px]">
                  Curated By
                </LabelMedium>
                <LabelMedium className="!text-[var(--color-text)] text-[14px]">
                  <Link to={`/profile/${playlist.curatedBy.handle}`}>
                    {playlist.curatedBy.displayName}
                  </Link>
                </LabelMedium>
              </div>
            </Group>

            <TableBuilder
              data={playlist.tracks.map((x, index) => ({
                id: x.id,
                index,
                trackNumber: x.trackNumber,
                albumArt: x.albumArt,
                title: x.title,
                artist: x.artist,
                uri: x.uri,
                albumUri: x.albumUri,
                artistUri: x.artistUri,
                albumArtist: x.albumArtist,
                duration: x.duration,
                discNumber: x.discNumber,
              }))}
              emptyMessage="You haven't listened to any music yet."
              divider="clean"
              overrides={{
                TableHeadRow: {
                  style: {
                    display: "none",
                    backgroundColor: "var(--color-background) !important",
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
                TableEmptyMessage: {
                  style: {
                    backgroundColor: "var(--color-background)",
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
                  <div className="flex flex-row items-center flex-1">
                    {row.index + 1}
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
          </>
        )}
      </div>
    </Main>
  );
}

export default Playlist;
