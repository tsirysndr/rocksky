import styled from "@emotion/styled";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingXSmall, LabelMedium } from "baseui/typography";
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

interface PopularTracksProps {
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
  artist: string;
}
function PopularTracks(props: PopularTracksProps) {
  return (
    <div className="mt-[50px]">
      <LabelMedium className="!text-[var(--color-text)]" marginBottom={"10px"}>
        Popular Tracks by
      </LabelMedium>
      <HeadingXSmall
        marginTop={"0px"}
        marginBottom={"10px"}
        className="!text-[var(--color-text)]"
      >
        {props.artist}
      </HeadingXSmall>
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
        emptyMessage="No tracks found"
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
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <div>
                <div className="!text-[var(--color-text)] mr-[20px]">
                  {row.index + 1}
                </div>
              </div>
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
    </div>
  );
}

export default PopularTracks;
