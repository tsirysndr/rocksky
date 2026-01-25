import {
  useTopArtistsQuery,
  useTopTracksQuery,
} from "../../../hooks/useLibrary";
import { Link } from "@tanstack/react-router";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import Artist from "../../../components/Icons/Artist";
import ContentLoader from "react-content-loader";

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

type ArtistRow = {
  id: string;
  name: string;
  picture: string;
  uri: string;
  scrobbles: number;
  index: number;
};

function Realtime() {
  const { data: artists, isLoading: artistsLoading } = useTopArtistsQuery();
  const { data: tracks, isLoading: tracksLoading } = useTopTracksQuery();
  return (
    <>
      <div className="flex">
        <div className="flex-1">
          <h3>Top Tracks</h3>
          {tracksLoading && (
            <div className="mt-[-80px]">
              <ContentLoader
                width="100%"
                height={500}
                viewBox="0 -10 600 500"
                backgroundColor="var(--color-skeleton-background)"
                foregroundColor="var(--color-skeleton-foreground)"
              >
                {/* Row 1 */}
                <rect x="0" y="0" rx="3" ry="3" width="30" height="15" />
                <rect x="50" y="0" rx="4" ry="4" width="60" height="60" />
                <rect x="130" y="5" rx="3" ry="3" width="200" height="15" />
                <rect x="130" y="30" rx="3" ry="3" width="150" height="12" />

                {/* Row 2 */}
                <rect x="0" y="85" rx="3" ry="3" width="30" height="15" />
                <rect x="50" y="80" rx="4" ry="4" width="60" height="60" />
                <rect x="130" y="90" rx="3" ry="3" width="200" height="15" />
                <rect x="130" y="115" rx="3" ry="3" width="150" height="12" />

                {/* Row 3 */}
                <rect x="0" y="165" rx="3" ry="3" width="30" height="15" />
                <rect x="50" y="160" rx="4" ry="4" width="60" height="60" />
                <rect x="130" y="170" rx="3" ry="3" width="200" height="15" />
                <rect x="130" y="195" rx="3" ry="3" width="150" height="12" />

                {/* Row 4 */}
                <rect x="0" y="245" rx="3" ry="3" width="30" height="15" />
                <rect x="50" y="240" rx="4" ry="4" width="60" height="60" />
                <rect x="130" y="250" rx="3" ry="3" width="200" height="15" />
                <rect x="130" y="275" rx="3" ry="3" width="150" height="12" />

                {/* Row 5 */}
                <rect x="0" y="325" rx="3" ry="3" width="30" height="15" />
                <rect x="50" y="320" rx="4" ry="4" width="60" height="60" />
                <rect x="130" y="330" rx="3" ry="3" width="200" height="15" />
                <rect x="130" y="355" rx="3" ry="3" width="150" height="12" />

                {/* Row 6 */}
                <rect x="0" y="405" rx="3" ry="3" width="30" height="15" />
                <rect x="50" y="400" rx="4" ry="4" width="60" height="60" />
                <rect x="130" y="410" rx="3" ry="3" width="200" height="15" />
                <rect x="130" y="435" rx="3" ry="3" width="150" height="12" />
              </ContentLoader>
            </div>
          )}
          {!tracksLoading && (
            <TableBuilder
              data={tracks?.map((x, index) => ({
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
                        {row.index + 1}
                      </div>
                    </div>
                    {row.albumUri && (
                      <Link
                        to={
                          `/${row.albumUri?.split("at://")[1].replace("app.rocksky.", "")}` as string
                        }
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
                        to={
                          `/${row.uri?.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                        }
                        className="!text-[var(--color-text)] no-underline"
                      >
                        {row.title}
                      </Link>
                      {row.artistUri && (
                        <Link
                          to={
                            `/${row.artistUri?.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                          }
                          className="!text-[var(--color-text-muted)] no-underline"
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
            </TableBuilder>
          )}
        </div>
        <div className="flex-1">
          <h3>Top Artists</h3>
          {artistsLoading && (
            <div className="mt-[-100px]">
              <ContentLoader
                width="100%"
                height={500}
                viewBox="0 -10 600 500"
                backgroundColor="var(--color-skeleton-background)"
                foregroundColor="var(--color-skeleton-foreground)"
              >
                {/* Row 1 */}
                <rect x="0" y="25" rx="3" ry="3" width="30" height="15" />
                <circle cx="80" cy="35" r="30" />
                <rect x="130" y="25" rx="3" ry="3" width="200" height="15" />

                {/* Row 2 */}
                <rect x="0" y="110" rx="3" ry="3" width="30" height="15" />
                <circle cx="80" cy="120" r="30" />
                <rect x="130" y="110" rx="3" ry="3" width="200" height="15" />

                {/* Row 3 */}
                <rect x="0" y="190" rx="3" ry="3" width="30" height="15" />
                <circle cx="80" cy="200" r="30" />
                <rect x="130" y="190" rx="3" ry="3" width="200" height="15" />

                {/* Row 4 */}
                <rect x="0" y="270" rx="3" ry="3" width="30" height="15" />
                <circle cx="80" cy="280" r="30" />
                <rect x="130" y="270" rx="3" ry="3" width="200" height="15" />

                {/* Row 5 */}
                <rect x="0" y="350" rx="3" ry="3" width="30" height="15" />
                <circle cx="80" cy="360" r="30" />
                <rect x="130" y="350" rx="3" ry="3" width="200" height="15" />

                {/* Row 6 */}
                <rect x="0" y="430" rx="3" ry="3" width="30" height="15" />
                <circle cx="80" cy="440" r="30" />
                <rect x="130" y="430" rx="3" ry="3" width="200" height="15" />
              </ContentLoader>
            </div>
          )}
          {!artistsLoading && (
            <TableBuilder
              data={artists?.map((x, index) => ({
                id: x.id,
                name: x.name,
                picture: x.picture,
                uri: x.uri,
                scrobbles: x.scrobbles,
                index,
              }))}
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
                {(row: ArtistRow) => (
                  <div className="flex flex-row items-center">
                    <div>
                      <div className="mr-[20px] text-[var(--color-text)]">
                        {row.index + 1}
                      </div>
                    </div>
                    <a
                      href={`/${row.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
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
                    </a>
                    <div>
                      <a
                        href={`/${row.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                        className="no-underline !text-[var(--color-text)]"
                      >
                        {row.name}
                      </a>
                    </div>
                  </div>
                )}
              </TableBuilderColumn>
            </TableBuilder>
          )}
        </div>
      </div>
    </>
  );
}

export default Realtime;
