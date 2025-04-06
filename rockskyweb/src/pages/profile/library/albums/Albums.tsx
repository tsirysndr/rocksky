import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingXSmall, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { statsAtom } from "../../../../atoms/stats";
import { topAlbumsAtom } from "../../../../atoms/topAlbums";
import { userAtom } from "../../../../atoms/user";
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

const Group = styled.div<{ mb?: number }>`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
  margin-bottom: 50px;
  ${({ mb }) =>
    mb &&
    css`
      margin-bottom: ${mb}px;
    `}
`;

interface AlbumsProps {
  offset?: number;
  size?: number;
}

function Albums(props: AlbumsProps) {
  const { size = 50 } = props;
  const setTopAlbums = useSetAtom(topAlbumsAtom);
  const topAlbums = useAtomValue(topAlbumsAtom);
  const stats = useAtomValue(statsAtom);
  const { did } = useParams<{ did: string }>();
  const { getAlbums } = useLibrary();
  const user = useAtomValue(userAtom);
  const [currentPage, setCurrentPage] = useState(1);
  const pages = useMemo(() => {
    if (!did || !stats[did] || !props.size) {
      return 1;
    }
    return Math.ceil(stats[did].albums / props.size) || 1;
  }, [stats, did, props.size]);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getTopAlbums = async () => {
      const data = await getAlbums(did, (currentPage - 1) * size, size);

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
  }, [did, currentPage]);

  const maxScrobbles = topAlbums.length > 0 ? topAlbums[0].scrobbles || 1 : 0;

  return (
    <>
      <Group mb={20}>
        <div style={{ marginRight: 20 }}>
          <LabelSmall>ALBUMS SCROBBLED</LabelSmall>
          <HeadingXSmall margin={0}>
            {did ? numeral(stats[did]?.albums).format("0,0") : ""}
          </HeadingXSmall>
        </div>
      </Group>
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
        emptyMessage={`@${user?.handle} has not listened to any albums yet.`}
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
                <div style={{ marginRight: 20 }}>
                  {(currentPage - 1) * size + row.index + 1}
                </div>
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
      <Pagination
        numPages={pages}
        currentPage={currentPage}
        onPageChange={({ nextPage }) => {
          setCurrentPage(Math.min(Math.max(nextPage, 1), pages));
        }}
        overrides={{
          Root: {
            style: {
              justifyContent: "center",
              marginTop: "30px",
            },
          },
        }}
      />
    </>
  );
}

export default Albums;
