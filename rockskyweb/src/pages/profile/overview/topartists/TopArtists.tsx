import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { topArtistsAtom } from "../../../../atoms/topArtists";
import { userAtom } from "../../../../atoms/user";
import Artist from "../../../../components/Icons/Artist";
import useLibrary from "../../../../hooks/useLibrary";

type Row = {
  id: string;
  name: string;
  picture: string;
  uri: string;
  scrobbles: number;
  index: number;
};

interface TopArtistsProps {
  showTitle?: boolean;
  size?: number;
}

function TopArtists({ showTitle = true, size = 30 }: TopArtistsProps) {
  const setTopArtists = useSetAtom(topArtistsAtom);
  const topArtists = useAtomValue(topArtistsAtom);
  const { did } = useParams<{ did: string }>();
  const { getArtists } = useLibrary();
  const user = useAtomValue(userAtom);

  useEffect(() => {
    if (!did) {
      return;
    }

    const getTopArtists = async () => {
      const data = await getArtists(did, 0, size);
      setTopArtists(data);
    };
    getTopArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  return (
    <>
      {showTitle && (
        <HeadingSmall marginBottom={"15px"}>Top Artists</HeadingSmall>
      )}
      <TableBuilder
        data={topArtists.map((x, index) => ({
          id: x.id,
          name: x.name,
          picture: x.picture,
          uri: x.uri,
          scrobbles: x.scrobbles,
          index,
        }))}
        emptyMessage={`@${user?.handle} has not listened to any artists yet.`}
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
              <div>
                <div style={{ marginRight: 20 }}>{row.index + 1}</div>
              </div>
              <Link to={`/${row.uri.split("at://")[1]}`}>
                {!!row.picture && (
                  <img
                    src={row.picture}
                    alt={row.name}
                    style={{
                      width: 60,
                      height: 60,
                      marginRight: 20,
                      borderRadius: 30,
                    }}
                  />
                )}
                {!row.picture && (
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      marginRight: 20,
                      borderRadius: 30,
                      backgroundColor: "rgba(243, 243, 243, 0.725)",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        height: 30,
                        width: 30,
                      }}
                    >
                      <Artist color="rgba(66, 87, 108, 0.65)" />
                    </div>
                  </div>
                )}
              </Link>
              <div>
                <Link
                  to={`/${row.uri.split("at://")[1]}`}
                  style={{
                    color: "initial",
                    textDecoration: "none",
                  }}
                >
                  {row.name}
                </Link>
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

export default TopArtists;
