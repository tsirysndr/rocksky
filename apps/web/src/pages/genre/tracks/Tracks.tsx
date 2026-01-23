import { Link, useParams } from "@tanstack/react-router";
import { useTracksByGenreQuery } from "../../../hooks/useLibrary";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import numeral from "numeral";

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

function Tracks() {
  const { id: genre } = useParams({ strict: false });
  const { data, isLoading } = useTracksByGenreQuery(genre!, 0, 20);
  return (
    <>
      {!isLoading && (
        <>
          <TableBuilder
            data={data?.map((x, index) => ({
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
            <TableBuilderColumn header="Scrobbles">
              {(row: Row, index?: number) => (
                <div className="relative w-[250px] mt-[-20px]">
                  <div
                    className={`absolute w-full top-[10px] left-[10px] z-[1]`}
                  >
                    {numeral(row.scrobbles).format("0,0")}{" "}
                    {index == 0 && " scrobbles"}
                  </div>
                  <span
                    style={{
                      backgroundColor: "var(--color-bar)",
                    }}
                    className="absolute h-[40px]"
                  ></span>
                </div>
              )}
            </TableBuilderColumn>
          </TableBuilder>
        </>
      )}
    </>
  );
}

export default Tracks;
