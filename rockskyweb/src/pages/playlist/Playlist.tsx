import styled from "@emotion/styled";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingMedium, LabelMedium } from "baseui/typography";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { useParams } from "react-router";
import { Link as DefaultLink } from "react-router-dom";
import Disc from "../../components/Icons/Disc";
import SongCover from "../../components/SongCover";
import { useTimeFormat } from "../../hooks/useFormat";
import usePlaylists from "../../hooks/usePlaylists";
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
  const { getPlaylist } = usePlaylists();
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
      <div style={{ paddingBottom: 100, paddingTop: 50 }}>
        {!playlist && (
          <ContentLoader viewBox="100 0 850 700" height={520} width={700}>
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
                <div
                  style={{
                    width: 240,
                    height: 240,
                    marginRight: 12,
                    borderRadius: 8,
                    backgroundColor: "rgba(243, 243, 243, 0.725)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      height: 130,
                      width: 130,
                    }}
                  >
                    <Disc color="rgba(66, 87, 108, 0.65)" />
                  </div>
                </div>
              )}
              <div style={{ marginLeft: 20 }}>
                <HeadingMedium margin={0}>{playlist.name}</HeadingMedium>
                <div style={{ marginTop: 10 }}>
                  <LabelMedium color="rgba(36, 49, 61, 0.65)">
                    {playlist.tracks.length} Track
                    {playlist.tracks.length > 1 ? "s" : ""}
                  </LabelMedium>
                </div>
                <div style={{ marginTop: 40 }}>
                  <LabelMedium>{playlist.description}</LabelMedium>
                </div>
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
                  },
                },
                TableBodyCell: {
                  style: {
                    verticalAlign: "center",
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
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      flex: 1,
                    }}
                  >
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
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div>
                        {row.uri && (
                          <Link to={`/${row.uri.split("at://")[1]}`}>
                            {row.title}
                          </Link>
                        )}
                        {!row.uri && <div>{row.title}</div>}
                      </div>
                      <div>
                        {row.artistUri && (
                          <Link
                            to={`/${row.artistUri.split("at://")[1]}`}
                            style={{
                              fontFamily: "RockfordSansLight",
                              color: "rgba(36, 49, 61, 0.65)",
                            }}
                          >
                            {row.albumArtist}
                          </Link>
                        )}
                        {!row.artistUri && (
                          <div
                            style={{
                              fontFamily: "RockfordSansLight",
                              color: "rgba(36, 49, 61, 0.65)",
                            }}
                          >
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
