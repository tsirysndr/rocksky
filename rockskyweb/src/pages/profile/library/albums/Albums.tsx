import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Pagination } from "baseui/pagination";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingXSmall, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { Link as DefaultLink, useParams } from "react-router";
import { topAlbumsAtom } from "../../../../atoms/topAlbums";
import { userAtom } from "../../../../atoms/user";
import { useAlbumsQuery } from "../../../../hooks/useLibrary";
import { useProfileStatsByDidQuery } from "../../../../hooks/useProfile";
import styles from "./styles";

type Row = {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  artistUri?: string;
  uri: string;
  scrobbles: number;
  index: number;
};

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Group = styled.div<{ mb?: number }>`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
  margin-bottom: 50px;
  ${({ mb }) =>
    mb &&
    css`
      margin-bottom: ${mb}px;
    `}
`;

interface AlbumsProps {
  offset?: number;
  size?: number;
}

function Albums(props: AlbumsProps) {
  const { size = 50 } = props;
  const setTopAlbums = useSetAtom(topAlbumsAtom);
  const topAlbums = useAtomValue(topAlbumsAtom);
  const { did } = useParams<{ did: string }>();
  const profileStats = useProfileStatsByDidQuery(did!);
  const [currentPage, setCurrentPage] = useState(1);
  const albumsResult = useAlbumsQuery(did!, (currentPage - 1) * size, size);
  const user = useAtomValue(userAtom);
  const pages = useMemo(() => {
    if (!did || !profileStats.data || !props.size) {
      return 1;
    }
    return Math.ceil(profileStats.data.albums / props.size) || 1;
  }, [profileStats.data, did, props.size]);

  useEffect(() => {
    if (albumsResult.isLoading || albumsResult.isError) {
      return;
    }

    if (!albumsResult.data || !did) {
      return;
    }

    setTopAlbums(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      albumsResult.data.map((x: any) => ({
        id: x.id,
        title: x.title,
        artist: x.artist,
        albumArt: x.album_art,
        artistUri: x.artist_uri,
        uri: x.uri,
        scrobbles: x.scrobbles,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumsResult.data, albumsResult.isLoading, albumsResult.isError, did]);

  const maxScrobbles = topAlbums.length > 0 ? topAlbums[0].scrobbles || 1 : 0;

  return (
    <>
      <Group mb={20}>
        <div style={{ marginRight: 20 }}>
          <LabelSmall className="!text-[var(--color-text-muted)]">
            ALBUMS SCROBBLED
          </LabelSmall>
          <HeadingXSmall margin={0} className="!text-[var(--color-text)]">
            {did ? numeral(profileStats.data?.albums).format("0,0") : ""}
          </HeadingXSmall>
        </div>
      </Group>
      <TableBuilder
        data={topAlbums.map((x, index) => ({
          id: x.id,
          title: x.title,
          artist: x.artist,
          albumArt: x.albumArt,
          artistUri: x.artistUri,
          uri: x.uri,
          scrobbles: x.scrobbles,
          index,
        }))}
        emptyMessage={`@${user?.handle} has not listened to any albums yet.`}
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
                  {(currentPage - 1) * size + row.index + 1}
                </div>
              </div>
              {row.uri && (
                <Link to={`/${row.uri?.split("at://")[1]}`}>
                  {!!row.albumArt && (
                    <img
                      src={row.albumArt}
                      alt={row.title}
                      className="w-[60px] h-[60px] mr-[20px] rounded-[5px]"
                    />
                  )}
                  {!row.albumArt && (
                    <div className="w-[60px] h-[60px] rounded-[5px] mr-[20px]" />
                  )}
                </Link>
              )}
              {!row.uri && (
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
                    {row.artist}
                  </Link>
                )}
                {!row.artistUri && (
                  <div className="!text-[var(--color-text-muted)]">
                    {row.artist}
                  </div>
                )}
              </div>
            </div>
          )}
        </TableBuilderColumn>
        <TableBuilderColumn header="Scrobbles">
          {(row: Row, index?: number) => (
            <div className="relative w-[250px] mt-[-20px]">
              <div className="absolute w-full top-[10px] left-[10px] text-black z-1 !text-[#000]">
                {numeral(row.scrobbles).format("0,0")}{" "}
                {index == 0 && " scrobbles"}
              </div>
              <span
                style={{
                  position: "absolute",
                  height: 40,
                  width: `${(row.scrobbles / maxScrobbles) * 100}%`,
                  backgroundColor: "var(--color-bar)",
                }}
              ></span>
            </div>
          )}
        </TableBuilderColumn>
      </TableBuilder>
      <Pagination
        numPages={pages}
        currentPage={currentPage}
        onPageChange={({ nextPage }) => {
          setCurrentPage(Math.min(Math.max(nextPage, 1), pages));
        }}
        overrides={styles.pagination}
      />
    </>
  );
}

export default Albums;
