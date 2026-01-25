import styled from "@emotion/styled";
import { Link as DefaultLink } from "@tanstack/react-router";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall } from "baseui/typography";
import ContentLoader from "react-content-loader";

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
  isLoading: boolean;
}

function PopularSongs(props: PopularSongsProps) {
  return (
    <>
      {props.isLoading && (
        <>
          <HeadingSmall
            marginBottom={"15px"}
            className="!text-[var(--color-text)]"
          >
            Popular Songs
          </HeadingSmall>
          <div className="ml-[-170px] mt-[20px]">
            <ContentLoader
              width="100%"
              height={500}
              viewBox="0 0 600 500"
              backgroundColor="var(--color-skeleton-background)"
              foregroundColor="var(--color-skeleton-foreground)"
            >
              {/* Row 1 */}
              <rect x="0" y="10" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="5" rx="4" ry="4" width="60" height="60" />
              <rect x="130" y="15" rx="3" ry="3" width="200" height="15" />
              <rect x="130" y="40" rx="3" ry="3" width="150" height="12" />
              <rect x="500" y="20" rx="3" ry="3" width="60" height="15" />

              {/* Row 2 */}
              <rect x="0" y="90" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="85" rx="4" ry="4" width="60" height="60" />
              <rect x="130" y="95" rx="3" ry="3" width="200" height="15" />
              <rect x="130" y="120" rx="3" ry="3" width="150" height="12" />
              <rect x="500" y="100" rx="3" ry="3" width="60" height="15" />

              {/* Row 3 */}
              <rect x="0" y="170" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="165" rx="4" ry="4" width="60" height="60" />
              <rect x="130" y="175" rx="3" ry="3" width="200" height="15" />
              <rect x="130" y="200" rx="3" ry="3" width="150" height="12" />
              <rect x="500" y="180" rx="3" ry="3" width="60" height="15" />

              {/* Row 4 */}
              <rect x="0" y="250" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="245" rx="4" ry="4" width="60" height="60" />
              <rect x="130" y="255" rx="3" ry="3" width="200" height="15" />
              <rect x="130" y="280" rx="3" ry="3" width="150" height="12" />
              <rect x="500" y="260" rx="3" ry="3" width="60" height="15" />

              {/* Row 5 */}
              <rect x="0" y="330" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="325" rx="4" ry="4" width="60" height="60" />
              <rect x="130" y="335" rx="3" ry="3" width="200" height="15" />
              <rect x="130" y="360" rx="3" ry="3" width="150" height="12" />
              <rect x="500" y="340" rx="3" ry="3" width="60" height="15" />

              {/* Row 6 */}
              <rect x="0" y="410" rx="3" ry="3" width="30" height="15" />
              <rect x="50" y="405" rx="4" ry="4" width="60" height="60" />
              <rect x="130" y="415" rx="3" ry="3" width="200" height="15" />
              <rect x="130" y="440" rx="3" ry="3" width="150" height="12" />
              <rect x="500" y="420" rx="3" ry="3" width="60" height="15" />
            </ContentLoader>
          </div>
        </>
      )}
      {!props.isLoading && (
        <>
          <HeadingSmall
            marginBottom={"15px"}
            className="!text-[var(--color-text)]"
          >
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
                      {row.index + 1}
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
                      to={`/${row.uri?.split("at://")[1].replace("app.rocksky.", "")}`}
                      className="!text-[var(--color-text)]"
                    >
                      {row.title}
                    </Link>
                    {row.artistUri && (
                      <Link
                        to={`/${row.artistUri?.split("at://")[1].replace("app.rocksky.", "")}`}
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
      )}
    </>
  );
}

export default PopularSongs;
