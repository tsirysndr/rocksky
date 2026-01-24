import {
  useTopArtistsQuery,
  useTopTracksQuery,
} from "../../../hooks/useLibrary";
import { Link } from "@tanstack/react-router";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import Artist from "../../../components/Icons/Artist";

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
  const { data: artists } = useTopArtistsQuery();
  const { data: tracks } = useTopTracksQuery();
  return (
    <>
      <div className="flex">
        <div className="flex-1">
          <h3>Top Tracks</h3>
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
        </div>
        <div className="flex-1">
          <h3>Top Artists</h3>
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
        </div>
      </div>
    </>
  );
}

export default Realtime;
