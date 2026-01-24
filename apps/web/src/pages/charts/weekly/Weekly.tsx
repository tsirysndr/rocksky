import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { useTopArtistsQuery } from "../../../hooks/useLibrary";
import { Link } from "@tanstack/react-router";
import Artist from "../../../components/Icons/Artist";
import { getLastDays } from "../../../lib/date";

type ArtistRow = {
  id: string;
  name: string;
  picture: string;
  uri: string;
  scrobbles: number;
  index: number;
};

function Weekly() {
  const { data: artists } = useTopArtistsQuery(0, 20, ...getLastDays(7));
  return (
    <>
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
              <Link
                to="/$did/artist/$rkey"
                params={{
                  did: row.uri?.split("at://")[1]?.split("/")[0] || "",
                  rkey: row.uri?.split("/").pop() || "",
                }}
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
              </Link>
              <div>
                <Link
                  to="/$did/artist/$rkey"
                  params={{
                    did: row.uri?.split("at://")[1]?.split("/")[0] || "",
                    rkey: row.uri?.split("/").pop() || "",
                  }}
                  className="no-underline !text-[var(--color-text)]"
                >
                  {row.name}
                </Link>
              </div>
            </div>
          )}
        </TableBuilderColumn>
      </TableBuilder>
    </>
  );
}

export default Weekly;
