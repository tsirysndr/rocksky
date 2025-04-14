import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall, HeadingXSmall, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { statsAtom } from "../../../../atoms/stats";
import { topArtistsAtom } from "../../../../atoms/topArtists";
import { userAtom } from "../../../../atoms/user";
import Artist from "../../../../components/Icons/Artist";
import useLibrary from "../../../../hooks/useLibrary";

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

type Row = {
  id: string;
  name: string;
  picture: string;
  uri: string;
  scrobbles: number;
  index: number;
};
interface TopArtistsProps {
  showTitle?: boolean;
  offset?: number;
  size?: number;
  showPagination?: boolean;
}

function TopArtists(props: TopArtistsProps) {
  const { showTitle = true, size = 30, showPagination } = props;
  const setTopArtists = useSetAtom(topArtistsAtom);
  const topArtists = useAtomValue(topArtistsAtom);
  const stats = useAtomValue(statsAtom);
  const { did } = useParams<{ did: string }>();
  const { getArtists } = useLibrary();
  const user = useAtomValue(userAtom);
  const [currentPage, setCurrentPage] = useState(1);
  const pages = useMemo(() => {
    if (!did || !stats[did] || !props.size) {
      return 1;
    }
    return Math.ceil(stats[did].artists / props.size) || 1;
  }, [stats, did, props.size]);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getTopArtists = async () => {
      const data = await getArtists(did, (currentPage - 1) * size, size);
      setTopArtists(data);
    };
    getTopArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, currentPage]);

  const maxScrobbles = topArtists.length > 0 ? topArtists[0].scrobbles || 1 : 0;

  return (
    <>
      {showTitle && (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <HeadingSmall marginBottom={"15px"}>Top Artists</HeadingSmall>
          <a
            href={`/profile/${user?.handle}?tab=1`}
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

      {props.showPagination && (
        <Group mb={20}>
          <div style={{ marginRight: 20 }}>
            <LabelSmall>ARTISTS SCROBBLED</LabelSmall>
            <HeadingXSmall margin={0}>
              {did ? numeral(stats[did]?.artists).format("0,0") : ""}
            </HeadingXSmall>
          </div>
        </Group>
      )}

      <TableBuilder
        data={topArtists.map((x, index) => ({
          id: x.id,
          name: x.name,
          picture: x.picture,
          uri: x.uri,
          scrobbles: x.scrobbles,
          index,
        }))}
        emptyMessage={`@${user?.handle} has not listened to any artists yet.`}
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
                  {props.showPagination
                    ? (currentPage - 1) * props.size! + row.index + 1
                    : row.index + 1}
                </div>
              </div>
              <Link to={`/${row.uri?.split("at://")[1]}`}>
                {!!row.picture && (
                  <img
                    src={row.picture}
                    alt={row.name}
                    style={{
                      width: 60,
                      height: 60,
                      marginRight: 20,
                      borderRadius: 30,
                    }}
                    key={row.id}
                  />
                )}
                {!row.picture && (
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      marginRight: 20,
                      borderRadius: 30,
                      backgroundColor: "rgba(243, 243, 243, 0.725)",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        height: 30,
                        width: 30,
                      }}
                    >
                      <Artist color="rgba(66, 87, 108, 0.65)" />
                    </div>
                  </div>
                )}
              </Link>
              <div>
                <Link
                  to={`/${row.uri?.split("at://")[1]}`}
                  style={{
                    color: "initial",
                    textDecoration: "none",
                  }}
                >
                  {row.name}
                </Link>
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
      {showPagination && (
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
      )}
    </>
  );
}

export default TopArtists;
