import styled from "@emotion/styled";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { topTracksAtom } from "../../../../atoms/topTracks";
import { userAtom } from "../../../../atoms/user";
import useLibrary from "../../../../hooks/useLibrary";

type Row = {
  id: string;
  title: string;
  artist: string;
  albumArtist: string;
  albumArt: string;
  albumUri?: string;
  artistUri?: string;
  uri: string;
  scrobbles: number;
  index: number;
};

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

interface TopTracksProps {
  showTitle?: boolean;
  size?: number;
}

function TopTracks(props: TopTracksProps) {
  props = {
    showTitle: true,
    size: 20,
    ...props,
  };
  const setTopTracks = useSetAtom(topTracksAtom);
  const topTracks = useAtomValue(topTracksAtom);
  const { did } = useParams<{ did: string }>();
  const { getTracks } = useLibrary();
  const user = useAtomValue(userAtom);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getTopTracks = async () => {
      const data = await getTracks(did, 0, props.size);
      setTopTracks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.map((track: any) => ({
          ...track,
          albumArt: track.album_art,
          albumArtist: track.album_artist,
          albumUri: track.album_uri,
          artistUri: track.artist_uri,
        }))
      );
    };
    getTopTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <div>
      {props.showTitle && (
        <HeadingSmall marginBottom={"15px"}>Top Tracks</HeadingSmall>
      )}
      <TableBuilder
        data={topTracks.map((x, index) => ({
          id: x.id,
          title: x.title,
          artist: x.artist,
          albumArtist: x.albumArtist,
          albumArt: x.albumArt,
          uri: x.uri,
          scrobbles: x.scrobbles,
          albumUri: x.albumUri,
          artistUri: x.artistUri,
          index,
        }))}
        emptyMessage={`@${user?.handle} has not listened to any tracks yet.`}
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
        <TableBuilderColumn header="Name">
          {(row: Row) => (
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ marginRight: 20 }}>{row.index + 1}</div>
              </div>
              {row.albumUri && (
                <Link to={`/${row.albumUri?.split("at://")[1]}`}>
                  {!!row.albumArt && (
                    <img
                      src={row.albumArt}
                      alt={row.title}
                      style={{
                        width: 60,
                        height: 60,
                        marginRight: 20,
                        borderRadius: 5,
                      }}
                    />
                  )}
                  {!row.albumArt && (
                    <div
                      style={{
                        width: 60,
                        height: 60,
                        marginRight: 20,
                        borderRadius: 5,
                        backgroundColor: "rgba(243, 243, 243, 0.725)",
                      }}
                    />
                  )}
                </Link>
              )}
              {!row.albumUri && (
                <div>
                  {!!row.albumArt && (
                    <img
                      src={row.albumArt}
                      alt={row.title}
                      style={{
                        width: 60,
                        height: 60,
                        marginRight: 20,
                        borderRadius: 5,
                      }}
                    />
                  )}
                  {!row.albumArt && (
                    <div
                      style={{
                        width: 60,
                        height: 60,
                        marginRight: 20,
                        borderRadius: 5,
                        backgroundColor: "rgba(243, 243, 243, 0.725)",
                      }}
                    />
                  )}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Link to={`/${row.uri?.split("at://")[1]}`}>{row.title}</Link>
                {row.artistUri && (
                  <Link
                    to={`/${row.artistUri?.split("at://")[1]}`}
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
          )}
        </TableBuilderColumn>
        <TableBuilderColumn header="Scrobbles">
          {(row: Row) => <div>{row.scrobbles}</div>}
        </TableBuilderColumn>
      </TableBuilder>
    </div>
  );
}

export default TopTracks;
