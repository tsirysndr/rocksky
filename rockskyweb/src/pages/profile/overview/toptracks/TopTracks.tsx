import styled from "@emotion/styled";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
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

  const maxScrobbles = topTracks.length > 0 ? topTracks[0].scrobbles || 1 : 0;

  return (
    <div>
      {props.showTitle && (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <HeadingSmall marginBottom={"15px"}>Top Tracks</HeadingSmall>
          <a
            href={`/profile/${user?.handle}?tab=3`}
            style={{
              marginTop: 40,
              textDecoration: "none",
              color: "#ff2876",
            }}
          >
            See All
          </a>
        </div>
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
          {(row: Row, index?: number) => (
            <div style={{ position: "relative", width: 250, marginTop: -20 }}>
              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  top: 10,
                  left: 10,
                }}
              >
                {numeral(row.scrobbles).format("0,0")}{" "}
                {index == 0 && " scrobbles"}
              </div>
              <span
                style={{
                  position: "absolute",
                  height: 40,
                  width: `${(row.scrobbles / maxScrobbles) * 100}%`,
                  backgroundColor: "rgba(255, 40, 118, 0.1)",
                }}
              ></span>
            </div>
          )}
        </TableBuilderColumn>
      </TableBuilder>
    </div>
  );
}

export default TopTracks;
