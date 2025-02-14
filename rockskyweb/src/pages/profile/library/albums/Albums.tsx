import styled from "@emotion/styled";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { topAlbumsAtom } from "../../../../atoms/topAlbums";
import useLibrary from "../../../../hooks/useLibrary";

type Row = {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
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

function Albums() {
  const setTopAlbums = useSetAtom(topAlbumsAtom);
  const topAlbums = useAtomValue(topAlbumsAtom);
  const { did } = useParams<{ did: string }>();
  const { getAlbums } = useLibrary();

  useEffect(() => {
    if (!did) {
      return;
    }

    const getTopAlbums = async () => {
      const data = await getAlbums(did, 0, 100);

      setTopAlbums(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.map((x: any) => ({
          id: x.id,
          title: x.title,
          artist: x.artist,
          albumArt: x.album_art,
          artistUri: x.artist_uri,
          uri: x.uri,
          scrobbles: x.scrobbles,
        }))
      );
    };

    getTopAlbums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      <TableBuilder
        data={topAlbums.map((x, index) => ({
          id: x.id,
          title: x.title,
          artist: x.artist,
          albumArt: x.albumArt,
          artistUri: x.artistUri,
          uri: x.uri,
          scrobbles: x.scrobbles,
          index,
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
              {row.uri && (
                <Link to={`/${row.uri?.split("at://")[1]}`}>
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
              {!row.uri && (
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
                    {row.artist}
                  </Link>
                )}
                {!row.artistUri && (
                  <div
                    style={{
                      fontFamily: "RockfordSansLight",
                      color: "rgba(36, 49, 61, 0.65)",
                    }}
                  >
                    {row.artist}
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
    </>
  );
}

export default Albums;
