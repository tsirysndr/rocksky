import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall, HeadingXSmall, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { topArtistsAtom } from "../../../../atoms/topArtists";
import { userAtom } from "../../../../atoms/user";
import Artist from "../../../../components/Icons/Artist";
import { useArtistsQuery } from "../../../../hooks/useLibrary";
import { useProfileStatsByDidQuery } from "../../../../hooks/useProfile";

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
  const { did } = useParams<{ did: string }>();
  const profileStats = useProfileStatsByDidQuery(did!);
  const [currentPage, setCurrentPage] = useState(1);
  const artistsResult = useArtistsQuery(did!, (currentPage - 1) * size, size);
  const user = useAtomValue(userAtom);
  const pages = useMemo(() => {
    if (!did || !profileStats.data || !props.size) {
      return 1;
    }
    return Math.ceil(profileStats.data.artists / props.size) || 1;
  }, [profileStats.data, did, props.size]);

  useEffect(() => {
    if (artistsResult.isLoading || artistsResult.isError) {
      return;
    }

    if (!artistsResult.data || !did) {
      return;
    }

    setTopArtists(artistsResult.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistsResult.data, artistsResult.isLoading, artistsResult.isError, did]);

  const maxScrobbles = topArtists.length > 0 ? topArtists[0].scrobbles || 1 : 0;

  return (
    <>
      {showTitle && (
        <div className="flex flex-row justify-between items-center">
          <HeadingSmall
            marginBottom={"15px"}
            className="!text-[var(--color-text)]"
          >
            Top Artists
          </HeadingSmall>
          <a
            href={`/profile/${user?.handle}?tab=1`}
            className="no-underline mt-[40px] text-[var(--color-primary)]"
          >
            See All
          </a>
        </div>
      )}

      {props.showPagination && (
        <Group mb={20}>
          <div className="mr-[20px]">
            <LabelSmall>ARTISTS SCROBBLED</LabelSmall>
            <HeadingXSmall margin={0}>
              {did ? numeral(profileStats.data?.artists).format("0,0") : ""}
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
        <TableBuilderColumn header="Name">
          {(row: Row) => (
            <div className="flex flex-row items-center">
              <div>
                <div className="mr-[20px] text-[var(--color-text)]">
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
                    className="w-[60px] h-[60px] rounded-full mr-[20px]"
                    key={row.id}
                  />
                )}
                {!row.picture && (
                  <div className="w-[60px] h-[60px] rounded-full bg-[rgba(243, 243, 243, 0.725)] flex justify-center items-center">
                    <div className="h-[30px] w-[30px]">
                      <Artist color="rgba(66, 87, 108, 0.65)" />
                    </div>
                  </div>
                )}
              </Link>
              <div>
                <Link
                  to={`/${row.uri?.split("at://")[1]}`}
                  className="no-underline !text-[var(--color-text)]"
                >
                  {row.name}
                </Link>
              </div>
            </div>
          )}
        </TableBuilderColumn>
        <TableBuilderColumn header="Scrobbles">
          {(row: Row, index?: number) => (
            <div className="relative w-[250px] mt-[-20px]">
              <div className="absolute w-full top-[10px] left-[10px] z-[1]">
                {numeral(row.scrobbles).format("0,0")}{" "}
                {index == 0 && " scrobbles"}
              </div>
              <span
                style={{
                  position: "absolute",
                  height: 40,
                  width: `${(row.scrobbles / maxScrobbles) * 100}%`,
                  backgroundColor: "var(--color-bar)",
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
