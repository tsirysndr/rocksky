import styled from "@emotion/styled";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall } from "baseui/typography";
import { Link as DefaultLink } from "react-router";

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
  uri: string;
  scrobbles: number;
  albumUri?: string;
  artistUri?: string;
  index: number;
};

interface PopularSongsProps {
  topTracks: {
    id: string;
    title: string;
    artist: string;
    albumArtist: string;
    albumArt: string;
    uri: string;
    scrobbles: number;
    albumUri?: string;
    artistUri?: string;
  }[];
}

function PopularSongs(props: PopularSongsProps) {
  return (
    <>
      <HeadingSmall marginBottom={"15px"} className="!text-[var(--color-text)]">
        Popular Songs
      </HeadingSmall>
      <TableBuilder
        data={props.topTracks.map((x, index) => ({
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
                  {row.index + 1}
                </div>
              </div>
              {row.albumUri && (
                <Link to={`/${row.albumUri?.split("at://")[1]}`}>
                  {!!row.albumArt && (
                    <img
                      src={row.albumArt}
                      alt={row.title}
                      className="w-[60px] h-[60px] mr-[20px] rounded-[5px]"
                    />
                  )}
                  {!row.albumArt && (
                    <div className="w-[60px] h-[60px] rounded-[5px] mr-[20px] bg-[rgba(243, 243, 243, 0.725)]" />
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
                    />
                  )}
                  {!row.albumArt && (
                    <div className="w-[60px] h-[60px] rounded-[5px] mr-[20px] bg-[rgba(243, 243, 243, 0.725)]" />
                  )}
                </div>
              )}
              <div className="flex flex-col">
                <Link
                  to={`/${row.uri?.split("at://")[1]}`}
                  className="!text-[var(--color-text)]"
                >
                  {row.title}
                </Link>
                {row.artistUri && (
                  <Link
                    to={`/${row.artistUri?.split("at://")[1]}`}
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
          {(row: Row) => <div>{row.scrobbles}</div>}
        </TableBuilderColumn>
      </TableBuilder>
    </>
  );
}

export default PopularSongs;
