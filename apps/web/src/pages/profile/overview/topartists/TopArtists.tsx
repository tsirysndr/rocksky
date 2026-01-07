import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Link, useParams } from "@tanstack/react-router";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall, HeadingXSmall, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { themeAtom } from "../../../../atoms/theme";
import { topArtistsAtom } from "../../../../atoms/topArtists";
import { userAtom } from "../../../../atoms/user";
import Artist from "../../../../components/Icons/Artist";
import { useArtistsQuery } from "../../../../hooks/useLibrary";
import { useProfileStatsByDidQuery } from "../../../../hooks/useProfile";
import styles from "./styles";
import { IconChevronDown } from "@tabler/icons-react";
import { getLastDays } from "../../../../lib/date";
import LastDaysMenu from "../../../../components/LastDaysMenu";
import {
  LAST_180_DAYS,
  LAST_30_DAYS,
  LAST_365_DAYS,
  LAST_7_DAYS,
  LAST_90_DAYS,
  LAST_DAYS_LABELS,
} from "../../../../consts";

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
  withDateRange?: boolean;
}

function TopArtists(props: TopArtistsProps) {
  const { showTitle = true, size = 30, showPagination, withDateRange } = props;
  const [topArtistsRange, setTopArtistsRange] = useState<string | undefined>(
    withDateRange ? LAST_7_DAYS : undefined,
  );
  const [range, setRange] = useState<[Date, Date] | []>(
    withDateRange ? getLastDays(7) : [],
  );
  const setTopArtists = useSetAtom(topArtistsAtom);
  const topArtists = useAtomValue(topArtistsAtom);
  const { darkMode } = useAtomValue(themeAtom);
  const { did } = useParams({ strict: false });
  const profileStats = useProfileStatsByDidQuery(did!);
  const [currentPage, setCurrentPage] = useState(1);
  const artistsResult = useArtistsQuery(
    did!,
    (currentPage - 1) * size,
    size,
    ...range,
  );
  const user = useAtomValue(userAtom);
  const pages = useMemo(() => {
    if (!did || !profileStats.data || !props.size) {
      return 1;
    }
    return Math.ceil(profileStats.data.artists / props.size) || 1;
  }, [profileStats.data, did, props.size]);

  const onSelectLastDays = (id: string) => {
    setTopArtistsRange(id);
    switch (id) {
      case LAST_7_DAYS:
        setRange(getLastDays(7));
        break;
      case LAST_30_DAYS:
        setRange(getLastDays(30));
        break;
      case LAST_90_DAYS:
        setRange(getLastDays(90));
        break;
      case LAST_180_DAYS:
        setRange(getLastDays(180));
        break;
      case LAST_365_DAYS:
        setRange(getLastDays(365));
        break;
      default:
        setRange([]);
    }
  };

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
          <LastDaysMenu onSelect={onSelectLastDays}>
            <button className="mt-[40px] bg-transparent text-[var(--color-text)] border-none cursor-pointer opacity-70 hover:opacity-100">
              {topArtistsRange && (
                <span>{LAST_DAYS_LABELS[topArtistsRange]}</span>
              )}
              <IconChevronDown
                size={16}
                className="ml-[4px] h-[18px] mb-[-5px]"
              />
            </button>
          </LastDaysMenu>
        </div>
      )}

      {props.showPagination && (
        <Group mb={20}>
          <div className="mr-[20px]">
            <LabelSmall className="!text-[var(--color-text-muted)]">
              ARTISTS SCROBBLED
            </LabelSmall>
            <HeadingXSmall margin={0} className="!text-[var(--color-text)]">
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
              <Link
                to="/$did/artist/$rkey"
                params={{
                  did: row.uri?.split("at://")[1]?.split("/")[0] || "",
                  rkey: row.uri?.split("/").pop() || "",
                }}
              >
                {!!row.picture && (
                  <img
                    src={row.picture}
                    alt={row.name}
                    className="w-[60px] h-[60px] rounded-full mr-[20px]"
                    key={row.id}
                  />
                )}
                {!row.picture && (
                  <div className="w-[60px] h-[60px] rounded-full bg-[rgba(243, 243, 243, 0.725)] flex justify-center items-center mr-[20px]">
                    <div className="h-[30px] w-[30px]">
                      <Artist color="rgba(66, 87, 108, 0.65)" />
                    </div>
                  </div>
                )}
              </Link>
              <div>
                <Link
                  to="/$did/artist/$rkey"
                  params={{
                    did: row.uri?.split("at://")[1]?.split("/")[0] || "",
                    rkey: row.uri?.split("/").pop() || "",
                  }}
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
              <div
                className={`absolute w-full top-[10px] left-[10px] z-[1] ${
                  darkMode && (row.scrobbles / maxScrobbles) * 100 < 10
                    ? "!text-[#fff]"
                    : "!text-[#000]"
                }`}
              >
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
          overrides={styles.pagination}
        />
      )}
    </>
  );
}

export default TopArtists;
