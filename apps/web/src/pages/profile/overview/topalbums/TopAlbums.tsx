import styled from "@emotion/styled";
import { Link as DefaultLink, useParams } from "@tanstack/react-router";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { HeadingSmall, LabelSmall } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { topAlbumsAtom } from "../../../../atoms/topAlbums";
import { userAtom } from "../../../../atoms/user";
import SongCover from "../../../../components/SongCover";
import { useAlbumsQuery } from "../../../../hooks/useLibrary";
import { IconChevronDown } from "@tabler/icons-react";
import { getLastDays } from "../../../../lib/date";
import {
  ALL_TIME,
  LAST_180_DAYS,
  LAST_30_DAYS,
  LAST_365_DAYS,
  LAST_7_DAYS,
  LAST_90_DAYS,
  LAST_DAYS_LABELS,
} from "../../../../consts";
import LastDaysMenu from "../../../../components/LastDaysMenu";

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

function TopAlbums() {
  const [topAlbumsRange, setTopAlbumsRange] = useState<string>(LAST_7_DAYS);
  const setTopAlbums = useSetAtom(topAlbumsAtom);
  const topAlbums = useAtomValue(topAlbumsAtom);
  const [range, setRange] = useState<[Date, Date] | []>(getLastDays(7));
  const { did } = useParams({ strict: false });
  const albumsResult = useAlbumsQuery(did!, 0, 12, ...range);
  const user = useAtomValue(userAtom);

  useEffect(() => {
    if (albumsResult.isLoading || albumsResult.isError) {
      return;
    }

    if (!albumsResult.data || !did) {
      return;
    }

    setTopAlbums(albumsResult.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumsResult.data, albumsResult.isLoading, albumsResult.isError, did]);

  useEffect(() => {
    if (albumsResult.isLoading || albumsResult.isError) {
      return;
    }

    if (topAlbumsRange === LAST_7_DAYS && albumsResult.data.length === 0) {
      setRange([]);
      setTopAlbumsRange(ALL_TIME);
    }
  }, [
    albumsResult.isLoading,
    albumsResult.isError,
    topAlbumsRange,
    albumsResult.data,
  ]);

  const onSelectLastDays = (id: string) => {
    setTopAlbumsRange(id);
    switch (id) {
      case LAST_7_DAYS:
        setRange(getLastDays(7));
        break;
      case LAST_30_DAYS:
        setRange(getLastDays(30));
        break;
      case LAST_90_DAYS:
        setRange(getLastDays(90));
        break;
      case LAST_180_DAYS:
        setRange(getLastDays(180));
        break;
      case LAST_365_DAYS:
        setRange(getLastDays(365));
        break;
      case ALL_TIME:
        setRange([]);
        break;
      default:
        setRange([]);
    }
  };

  return (
    <>
      <div className="flex flex-row justify-between items-center">
        <HeadingSmall
          marginBottom={"15px"}
          className="!text-[var(--color-text)]"
        >
          Top Albums
        </HeadingSmall>
        <LastDaysMenu onSelect={onSelectLastDays}>
          <button className="mt-[40px] mb-[10px] bg-transparent text-[var(--color-text)] border-none cursor-pointer opacity-70 hover:opacity-100">
            <span>
              <span>{LAST_DAYS_LABELS[topAlbumsRange]}</span>
            </span>
            <IconChevronDown
              size={16}
              className="ml-[4px] h-[18px] mb-[-5px]"
            />
          </button>
        </LastDaysMenu>
      </div>
      {!topAlbums.length && (
        <div className="text-[var(--color-text-muted)] text-[14px]">
          @{user?.handle} has not listened to any albums yet.
        </div>
      )}
      {topAlbums.length > 0 && (
        <FlexGrid
          flexGridColumnCount={[1, 2, 3]}
          flexGridColumnGap="scale800"
          flexGridRowGap="scale800"
        >
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            topAlbums.map((album: any, index: number) => (
              <FlexGridItem {...itemProps} key={index}>
                <Link
                  to={`/${album.uri?.split("at://")[1].replace("app.rocksky.", "")}`}
                >
                  <SongCover cover={album.albumArt} size={230} />
                </Link>
                <Link
                  to={`/${album.uri?.split("at://")[1].replace("app.rocksky.", "")}`}
                >
                  <b className="!text-[var(--color-text)] text-[15px]">
                    {album.title}
                  </b>
                </Link>
                {album.artistUri && (
                  <Link
                    to={`/${album.artistUri.split("at://")[1].replace("app.rocksky.", "")}`}
                  >
                    <span className="!text-[var(--color-text)]  text-[14px]">
                      {album.artist}
                    </span>
                  </Link>
                )}
                {!album.artistUri && (
                  <span className="!text-[var(--color-text)]  text-[14px]">
                    {album.artist}
                  </span>
                )}
                <LabelSmall className="!text-[var(--color-text-muted)]">
                  {album.scrobbles} plays
                </LabelSmall>
              </FlexGridItem>
            ))
          }
        </FlexGrid>
      )}
    </>
  );
}

export default TopAlbums;
