import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Link as DefaultLink, useParams } from "@tanstack/react-router";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingSmall, HeadingXSmall, LabelSmall } from "baseui/typography";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { recentTracksAtom } from "../../../../atoms/recentTracks";
import { userAtom } from "../../../../atoms/user";
import {
  useProfileStatsByDidQuery,
  useRecentTracksByDidQuery,
} from "../../../../hooks/useProfile";
import styles from "./styles";
import ContentLoader from "react-content-loader";

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

type Row = {
  id: string;
  title: string;
  artist: string;
  albumArtist: string;
  albumArt: string;
  date: string;
  albumUri: string;
  artistUri: string;
  scrobbleUri: string;
  uri: string;
};

interface RecentTracksProps {
  showTitle?: boolean;
  offset?: number;
  size?: number;
  showPagination?: boolean;
}

function RecentTracks(props: RecentTracksProps) {
  props = {
    showTitle: true,
    size: 10,
    ...props,
  };
  const { did } = useParams({ strict: false });
  const profileStats = useProfileStatsByDidQuery(did!);
  const [currentPage, setCurrentPage] = useState(1);
  const recentTracksResult = useRecentTracksByDidQuery(
    did!,
    (currentPage - 1) * props.size!,
    props.size!,
  );
  const setRecentTracks = useSetAtom(recentTracksAtom);
  const recentTracks = useAtomValue(recentTracksAtom);
  const user = useAtomValue(userAtom);
  const pages = useMemo(() => {
    if (!did || !profileStats.data || !props.size) {
      return 1;
    }
    return Math.ceil(profileStats.data.scrobbles / props.size) || 1;
  }, [profileStats.data, did, props.size]);

  useEffect(() => {
    if (recentTracksResult.isLoading || recentTracksResult.isError) {
      return;
    }

    if (!recentTracksResult.data || !did) {
      return;
    }

    setRecentTracks(
      recentTracksResult.data.map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        album: item.album,
        albumArt: item.albumArt,
        albumArtist: item.albumArtist,
        uri: item.uri,
        date: item.createdAt.endsWith("Z")
          ? item.createdAt
          : `${item.createdAt}Z`,
        scrobbleUri: item.uri,
        albumUri: item.albumUri,
        artistUri: item.artistUri,
      })),
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    recentTracksResult.data,
    recentTracksResult.isLoading,
    recentTracksResult.isError,
    did,
  ]);

  return (
    <>
      {props.showTitle && (
        <div className="flex flex-row justify-between items-center">
          <HeadingSmall
            marginBottom={"10px"}
            className="!text-[var(--color-text)]"
          >
            Recent Listens
          </HeadingSmall>
          <a
            href={`/profile/${user?.handle}?tab=0`}
            className="no-underline mt-[40px] text-[var(--color-text)] text-[13px] opacity-70 hover:opacity-100"
            style={{ fontFamily: "RockfordSansMedium" }}
          >
            See All
          </a>
        </div>
      )}

      {props.showPagination && (
        <Group mb={20}>
          <div className="mr-[20px]">
            <LabelSmall className="!text-[var(--color-text-muted)]">
              SCROBBLES
            </LabelSmall>
            <HeadingXSmall margin={0} className="!text-[var(--color-text)]">
              {did ? numeral(profileStats.data?.scrobbles).format("0,0") : ""}
            </HeadingXSmall>
          </div>
        </Group>
      )}

      {recentTracksResult.isLoading && (
        <ContentLoader
          width="100%"
          height={500}
          viewBox="0 0 700 500"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          {/* Row 1 */}
          <rect x="0" y="5" rx="4" ry="4" width="60" height="60" />
          <rect x="80" y="15" rx="3" ry="3" width="220" height="15" />
          <rect x="350" y="15" rx="3" ry="3" width="150" height="15" />
          <rect x="550" y="15" rx="3" ry="3" width="120" height="12" />

          {/* Row 2 */}
          <rect x="0" y="85" rx="4" ry="4" width="60" height="60" />
          <rect x="80" y="95" rx="3" ry="3" width="220" height="15" />
          <rect x="350" y="95" rx="3" ry="3" width="150" height="15" />
          <rect x="550" y="95" rx="3" ry="3" width="120" height="12" />

          {/* Row 3 */}
          <rect x="0" y="165" rx="4" ry="4" width="60" height="60" />
          <rect x="80" y="175" rx="3" ry="3" width="220" height="15" />
          <rect x="350" y="175" rx="3" ry="3" width="150" height="15" />
          <rect x="550" y="175" rx="3" ry="3" width="120" height="12" />

          {/* Row 4 */}
          <rect x="0" y="245" rx="4" ry="4" width="60" height="60" />
          <rect x="80" y="255" rx="3" ry="3" width="220" height="15" />
          <rect x="350" y="255" rx="3" ry="3" width="150" height="15" />
          <rect x="550" y="255" rx="3" ry="3" width="120" height="12" />

          {/* Row 5 */}
          <rect x="0" y="325" rx="4" ry="4" width="60" height="60" />
          <rect x="80" y="335" rx="3" ry="3" width="220" height="15" />
          <rect x="350" y="335" rx="3" ry="3" width="150" height="15" />
          <rect x="550" y="335" rx="3" ry="3" width="120" height="12" />

          {/* Row 6 */}
          <rect x="0" y="405" rx="4" ry="4" width="60" height="60" />
          <rect x="80" y="415" rx="3" ry="3" width="220" height="15" />
          <rect x="350" y="415" rx="3" ry="3" width="150" height="15" />
          <rect x="550" y="415" rx="3" ry="3" width="120" height="12" />
        </ContentLoader>
      )}

      {!recentTracksResult.isLoading && (
        <TableBuilder
          data={recentTracks.map((x) => ({
            id: x.id,
            albumArt: x.albumArt,
            title: x.title,
            artist: x.artist,
            date: x.date,
            uri: x.uri,
            albumUri: x.albumUri,
            artistUri: x.artistUri,
            albumArtist: x.albumArtist,
          }))}
          emptyMessage={`@${user?.handle} has not listened to any tracks yet.`}
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
          <TableBuilderColumn header="Title">
            {(row: Row) => (
              <div className="flex flex-row items-center">
                <Link
                  to={`/${row.albumUri?.split("at://")[1].replace("app.rocksky.", "")}`}
                >
                  <img
                    src={row.albumArt}
                    alt={row.title}
                    className="w-[60px] mr-[20px] rounded-[5px]"
                    key={row.id}
                  />
                </Link>
                <div>
                  <Link
                    to={`/${row.uri?.split("at://")[1].replace("app.rocksky.", "")}`}
                    className="!text-[var(--color-text)]"
                  >
                    {row.title}
                  </Link>
                </div>
              </div>
            )}
          </TableBuilderColumn>
          <TableBuilderColumn header="Artist">
            {(row: Row) => (
              <Link
                to={`/${row.artistUri?.split("at://")[1].replace("app.rocksky.", "")}`}
                style={{ fontFamily: "RockfordSansLight" }}
                className="!text-[var(--color-text)]"
              >
                {row.albumArtist}
              </Link>
            )}
          </TableBuilderColumn>
          <TableBuilderColumn header="Date">
            {(row: Row) => (
              <StatefulTooltip
                content={dayjs(row.date).format("MMMM D, YYYY [at] HH:mm A")}
                returnFocus
                autoFocus
              >
                <div className="w-[120px] text-[var(--color-text-muted)]">
                  {dayjs(row.date).fromNow()}
                </div>
              </StatefulTooltip>
            )}
          </TableBuilderColumn>
        </TableBuilder>
      )}
      {props.showPagination && !recentTracksResult.isLoading && (
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

export default RecentTracks;
