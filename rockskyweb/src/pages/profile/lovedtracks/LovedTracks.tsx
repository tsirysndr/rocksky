import styled from "@emotion/styled";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingSmall } from "baseui/typography";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { lovedTracksAtom } from "../../../atoms/lovedTracks";
import useLibrary from "../../../hooks/useLibrary";

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
  date: string;
};

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

function LovedTracks() {
  const { did } = useParams<{ did: string }>();
  const lovedTracks = useAtomValue(lovedTracksAtom);
  const setLovedTracks = useSetAtom(lovedTracksAtom);
  const { getLovedTracks } = useLibrary();

  useEffect(() => {
    const fetchLovedTracks = async () => {
      if (!did) {
        return;
      }
      const data = await getLovedTracks(did);

      setLovedTracks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.records.map((item: any) => ({
          ...item.track_id,
          albumArt: item.track_id.album_art,
          albumArtist: item.track_id.album_artist,
          albumUri: item.track_id.album_uri,
          artistUri: item.track_id.artist_uri,
          date: item.xata_createdat,
        }))
      );
    };
    fetchLovedTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      <HeadingSmall>Loved Tracks</HeadingSmall>
      <TableBuilder
        data={lovedTracks.map((x, index) => ({
          id: x.id,
          title: x.title,
          artist: x.artist,
          albumArtist: x.albumArtist,
          albumArt: x.albumArt,
          uri: x.uri,
          scrobbles: x.scrobbles,
          albumUri: x.albumUri,
          artistUri: x.artistUri,
          date: x.date,
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

export default LovedTracks;
