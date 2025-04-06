import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingSmall, HeadingXSmall, LabelSmall } from "baseui/typography";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { recentTracksAtom } from "../../../../atoms/recentTracks";
import { statsAtom } from "../../../../atoms/stats";
import { userAtom } from "../../../../atoms/user";
import useProfile from "../../../../hooks/useProfile";

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
  const { did } = useParams<{ did: string }>();
  const { getRecentTracksByDid } = useProfile();
  const setRecentTracks = useSetAtom(recentTracksAtom);
  const recentTracks = useAtomValue(recentTracksAtom);
  const stats = useAtomValue(statsAtom);
  const user = useAtomValue(userAtom);
  const [currentPage, setCurrentPage] = useState(1);
  const pages = useMemo(() => {
    if (!did || !stats[did] || !props.size) {
      return 1;
    }
    return Math.ceil(stats[did].scrobbles / props.size) || 1;
  }, [stats, did, props.size]);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getRecentTracks = async () => {
      const data = await getRecentTracksByDid(
        did,
        (currentPage - 1) * props.size!,
        props.size!
      );
      setRecentTracks(
        data.map((item) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          album: item.album,
          albumArt: item.album_art,
          albumArtist: item.album_artist,
          uri: item.uri,
          date: item.created_at.endsWith("Z")
            ? item.created_at
            : `${item.created_at}Z`,
          scrobbleUri: item.uri,
          albumUri: item.album_uri,
          artistUri: item.artist_uri,
        }))
      );
    };

    getRecentTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, currentPage]);
  return (
    <>
      {props.showTitle && (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <HeadingSmall marginBottom={"10px"}>Recent Tracks</HeadingSmall>
          <a
            href={`/profile/${user?.handle}?tab=0`}
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
            <LabelSmall>SCROBBLES</LabelSmall>
            <HeadingXSmall margin={0}>
              {did ? numeral(stats[did]?.scrobbles).format("0,0") : ""}
            </HeadingXSmall>
          </div>
        </Group>
      )}

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
            },
          },
          TableBodyCell: {
            style: {
              verticalAlign: "center",
            },
          },
        }}
      >
        <TableBuilderColumn header="Title">
          {(row: Row) => (
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Link to={`/${row.albumUri.split("at://")[1]}`}>
                <img
                  src={row.albumArt}
                  alt={row.title}
                  style={{ width: 60, marginRight: 20, borderRadius: 5 }}
                  key={row.id}
                />
              </Link>
              <div>
                <Link to={`/${row.uri.split("at://")[1]}`}>{row.title}</Link>
              </div>
            </div>
          )}
        </TableBuilderColumn>
        <TableBuilderColumn header="Artist">
          {(row: Row) => (
            <Link
              to={`/${row.artistUri.split("at://")[1]}`}
              style={{ fontFamily: "RockfordSansLight" }}
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
              <div style={{ width: 120, color: "rgba(66, 87, 108, 0.65)" }}>
                {dayjs(row.date).fromNow()}
              </div>
            </StatefulTooltip>
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

export default RecentTracks;
