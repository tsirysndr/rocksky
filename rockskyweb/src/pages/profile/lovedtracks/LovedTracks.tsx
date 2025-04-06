import styled from "@emotion/styled";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingSmall } from "baseui/typography";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { lovedTracksAtom } from "../../../atoms/lovedTracks";
import { statsAtom } from "../../../atoms/stats";
import { userAtom } from "../../../atoms/user";
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
  const size = 50;
  const { did } = useParams<{ did: string }>();
  const lovedTracks = useAtomValue(lovedTracksAtom);
  const setLovedTracks = useSetAtom(lovedTracksAtom);
  const { getLovedTracks } = useLibrary();
  const user = useAtomValue(userAtom);
  const stats = useAtomValue(statsAtom);
  const [currentPage, setCurrentPage] = useState(1);
  const pages = useMemo(() => {
    if (!did || !stats[did]) {
      return 1;
    }
    return Math.ceil(stats[did].lovedTracks / size) || 1;
  }, [stats, did]);

  useEffect(() => {
    const fetchLovedTracks = async () => {
      if (!did) {
        return;
      }
      const data = await getLovedTracks(did, (currentPage - 1) * size, size);

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
  }, [did, currentPage]);

  return (
    <>
      {did && (
        <HeadingSmall>
          Loved Tracks ({numeral(stats[did]?.lovedTracks).format("0,0")})
        </HeadingSmall>
      )}
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
        emptyMessage={`@${user?.handle} has not loved any tracks yet.`}
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
                {row.uri && (
                  <Link to={`/${row.uri?.split("at://")[1]}`}>{row.title}</Link>
                )}
                {!row.uri && <div>{row.title}</div>}
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

export default LovedTracks;
