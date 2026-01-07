import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Link as DefaultLink, useParams } from "@tanstack/react-router";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall, HeadingXSmall, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { themeAtom } from "../../../../atoms/theme";
import { topTracksAtom } from "../../../../atoms/topTracks";
import { userAtom } from "../../../../atoms/user";
import { useTracksQuery } from "../../../../hooks/useLibrary";
import { useProfileStatsByDidQuery } from "../../../../hooks/useProfile";
import styles from "./styles";
import { IconChevronDown } from "@tabler/icons-react";
import { getLastDays } from "../../../../lib/date";
import {
  LAST_7_DAYS,
  LAST_30_DAYS,
  LAST_90_DAYS,
  LAST_180_DAYS,
  LAST_365_DAYS,
  LAST_DAYS_LABELS,
  ALL_TIME,
} from "../../../../consts";
import LastDaysMenu from "../../../../components/LastDaysMenu";

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
interface TopTracksProps {
  showTitle?: boolean;
  offset?: number;
  size?: number;
  showPagination?: boolean;
  withDateRange?: boolean;
}

function TopTracks(props: TopTracksProps) {
  props = {
    showTitle: true,
    size: 20,
    showPagination: false,
    ...props,
  };

  const [range, setRange] = useState<[Date, Date] | []>(
    props.withDateRange ? getLastDays(7) : [],
  );
  const [topTracksRange, setTopTracksRange] = useState<string>(LAST_7_DAYS);
  const setTopTracks = useSetAtom(topTracksAtom);
  const topTracks = useAtomValue(topTracksAtom);
  const { darkMode } = useAtomValue(themeAtom);
  const { did } = useParams({ strict: false });
  const profileStats = useProfileStatsByDidQuery(did!);
  const [currentPage, setCurrentPage] = useState(1);
  const tracksResult = useTracksQuery(
    did!,
    (currentPage - 1) * props.size!,
    props.size!,
    ...range,
  );
  const user = useAtomValue(userAtom);
  const pages = useMemo(() => {
    if (!did || !profileStats.data || !props.size) {
      return 1;
    }
    return Math.ceil(profileStats.data.tracks / props.size) || 1;
  }, [profileStats.data, did, props.size]);

  useEffect(() => {
    if (tracksResult.isLoading || tracksResult.isError) {
      return;
    }

    if (!tracksResult.data || !did) {
      return;
    }

    setTopTracks(tracksResult.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracksResult.data, tracksResult.isLoading, tracksResult.isError, did]);

  useEffect(() => {
    if (tracksResult.isLoading || tracksResult.isError) {
      return;
    }

    if (topTracksRange === LAST_7_DAYS && tracksResult.data.length === 0) {
      setRange([]);
      setTopTracksRange(ALL_TIME);
    }
  }, [
    tracksResult.isLoading,
    tracksResult.isError,
    topTracksRange,
    tracksResult.data,
  ]);
  const onSelectLastDays = (id: string) => {
    setTopTracksRange(id);
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

  const maxScrobbles = topTracks.length > 0 ? topTracks[0].scrobbles || 1 : 0;

  return (
    <div>
      {props.showTitle && (
        <div className="flex flex-row justify-between items-center">
          <HeadingSmall
            marginBottom={"15px"}
            className="!text-[var(--color-text)]"
          >
            Top Tracks
          </HeadingSmall>
          <LastDaysMenu onSelect={onSelectLastDays}>
            <button className="mt-[40px] bg-transparent text-[var(--color-text)] border-none cursor-pointer opacity-70 hover:opacity-100">
              {topTracksRange && (
                <span>{LAST_DAYS_LABELS[topTracksRange]}</span>
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
              TRACKS SCROBBLED
            </LabelSmall>
            <HeadingXSmall margin={0} className="!text-[var(--color-text)]">
              {did ? numeral(profileStats.data?.tracks).format("0,0") : ""}
            </HeadingXSmall>
          </div>
        </Group>
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
                <div className="text-[var(--color-text)] mr-[20px]">
                  {(currentPage - 1) * props.size! + row.index + 1}
                </div>
              </div>
              {row.albumUri && (
                <Link
                  to={`/${row.albumUri?.split("at://")[1].replace("app.rocksky.", "")}`}
                >
                  {!!row.albumArt && (
                    <img
                      src={row.albumArt}
                      alt={row.title}
                      className="w-[60px] h-[60px] mr-[20px] rounded-[5px]"
                      key={row.id}
                    />
                  )}
                  {!row.albumArt && (
                    <div className="w-[60px] h-[60px] rounded-[5px] bg-[rgba(243, 243, 243, 0.725)]" />
                  )}
                </Link>
              )}
              {!row.albumUri && (
                <div>
                  {!!row.albumArt && (
                    <img
                      src={row.albumArt}
                      alt={row.title}
                      className="w-[60px] h-[60px] mr-[20px] rounded-[5px]"
                      key={row.id}
                    />
                  )}
                  {!row.albumArt && (
                    <div className="w-[60px] h-[60px] rounded-[5px] bg-[rgba(243, 243, 243, 0.725)]" />
                  )}
                </div>
              )}
              <div className="flex flex-col">
                <Link
                  to={`/${row.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                  className="!text-[var(--color-text)]"
                >
                  {row.title}
                </Link>
                {row.artistUri && (
                  <Link
                    to={`/${row.artistUri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
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
                  width: `${(row.scrobbles / maxScrobbles) * 100}%`,
                  backgroundColor: "var(--color-bar)",
                }}
                className="absolute h-[40px]"
              ></span>
            </div>
          )}
        </TableBuilderColumn>
      </TableBuilder>
      {props.showPagination && (
        <Pagination
          numPages={pages}
          currentPage={currentPage}
          onPageChange={({ nextPage }) => {
            setCurrentPage(Math.min(Math.max(nextPage, 1), pages));
          }}
          overrides={styles.pagination}
        />
      )}
    </div>
  );
}

export default TopTracks;
