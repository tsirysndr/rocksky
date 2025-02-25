import styled from "@emotion/styled";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingSmall } from "baseui/typography";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { recentTracksAtom } from "../../../../atoms/recentTracks";
import { userAtom } from "../../../../atoms/user";
import useProfile from "../../../../hooks/useProfile";

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
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
  size?: number;
}

function RecentTracks(props: RecentTracksProps) {
  props = {
    showTitle: true,
    size: 10,
    ...props,
  };
  const { did } = useParams<{ did: string }>();
  const { getRecentTracksByDid } = useProfile(localStorage.getItem("token"));
  const setRecentTracks = useSetAtom(recentTracksAtom);
  const recentTracks = useAtomValue(recentTracksAtom);
  const user = useAtomValue(userAtom);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getRecentTracks = async () => {
      const data = await getRecentTracksByDid(did, 0, props.size);
      setRecentTracks(
        data.map(({ track_id, album_id, artist_id, uri, xata_createdat }) => ({
          id: track_id.xata_id,
          title: track_id.title,
          artist: track_id.artist,
          album: track_id.album,
          albumArt: track_id.album_art,
          albumArtist: track_id.album_artist,
          duration: track_id.duration,
          uri: track_id.uri,
          date: xata_createdat,
          scrobbleUri: uri,
          albumUri: album_id.uri,
          artistUri: artist_id.uri,
        }))
      );
    };

    getRecentTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);
  return (
    <>
      {props.showTitle && (
        <HeadingSmall marginBottom={"10px"}>Recent Tracks</HeadingSmall>
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
    </>
  );
}

export default RecentTracks;
