import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { useTopArtistsQuery } from "../../../hooks/useLibrary";
import { Link } from "@tanstack/react-router";
import Artist from "../../../components/Icons/Artist";
import { getLastDays } from "../../../lib/date";
import dayjs from "dayjs";
import numeral from "numeral";

type ArtistRow = {
  id: string;
  name: string;
  picture: string;
  uri: string;
  scrobbles: number;
  uniqueListeners: number;
  index: number;
};

function Weekly() {
  const { data: artists } = useTopArtistsQuery(0, 20, ...getLastDays(7));
  const end = dayjs();
  const start = end.subtract(7, "day");
  const range = `${start.format("DD MMM YYYY")} — ${end.format("DD MMM YYYY")}`;

  return (
    <>
      <div className="mt-[15px] mb-[25px]">
        <strong>{range}</strong>
      </div>
      <TableBuilder
        data={artists?.map((x, index) => ({
          ...x,
          index,
        }))}
        divider="clean"
        overrides={{
          TableBodyCell: {
            style: {
              verticalAlign: "middle",
            },
          },
          TableHead: {
            style: {
              backgroundColor: "var(--color-background) !important",
            },
          },
          TableHeadRow: {
            style: {
              backgroundColor: "var(--color-background) !important",
            },
          },
          TableHeadCell: {
            style: {
              backgroundColor: "var(--color-background) !important",
              color: "var(--color-text) !important",
              opacity: "90%",
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
        <TableBuilderColumn header="Artist">
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
        <TableBuilderColumn header="Listeners">
          {(row: ArtistRow) => (
            <div className="flex flex-row items-center">
              {numeral(row.uniqueListeners).format("0.0")}
            </div>
          )}
        </TableBuilderColumn>
        <TableBuilderColumn header="Scrobbles">
          {(row: ArtistRow) => (
            <div className="flex flex-row items-center">
              {numeral(row.scrobbles).format("0,0")}
            </div>
          )}
        </TableBuilderColumn>
      </TableBuilder>
    </>
  );
}

export default Weekly;
