import { Link, useParams } from "@tanstack/react-router";
import { useAlbumsByGenreInfiniteQuery } from "../../../hooks/useLibrary";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { BlockProps } from "baseui/block";
import numeral from "numeral";
import dayjs from "dayjs";
import { useEffect, useRef } from "react";
import { LabelSmall } from "baseui/typography";

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

function Albums() {
  const { id: genre } = useParams({ strict: false });
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useAlbumsByGenreInfiniteQuery(genre!, 24);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allAlbums = data?.pages.flatMap((page) => page.albums) ?? [];

  return (
    <>
      {!isLoading && (
        <>
          <FlexGrid
            flexGridColumnCount={[1, 2, 3]}
            flexGridColumnGap="scale800"
            flexGridRowGap="scale1000"
            className="mt-[50px]"
          >
            {allAlbums.map((album) => (
              <FlexGridItem {...itemProps} key={album.id}>
                <div className="flex flex-col items-start">
                  <Link
                    to={
                      `/${album.uri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                    }
                    className="text-initial"
                  >
                    <img
                      src={album.albumArt}
                      alt={album.title}
                      className="w-[230px] h-[230px]  mb-[20px]"
                      key={album.id}
                    />
                  </Link>
                  <Link
                    to={
                      `/${album.uri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                    }
                    className="!text-[var(--color-text)] no-underline line-clamp-2 text-start max-w-[230px]"
                  >
                    <b>{album.title}</b>
                  </Link>
                  <Link
                    to={
                      `/${album.artistUri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                    }
                    className="!text-[var(--color-text)] no-underline"
                  >
                    <span className="text-[14px] line-clamp-2 text-start max-w-[230px]">
                      {album.artist}
                    </span>
                  </Link>
                  <span className="!text-[var(--color-text-muted)] text-[14px] mt-[5px]">
                    {numeral(album.playCount).format("0,0")} plays
                  </span>
                  <span className="!text-[var(--color-text-muted)] text-[14px]">
                    {album.releaseDate
                      ? dayjs(album.releaseDate).format("MMMM D, YYYY")
                      : album.year}
                  </span>
                </div>
              </FlexGridItem>
            ))}
          </FlexGrid>

          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="h-[20px] w-full" />

          {isFetchingNextPage && (
            <div className="text-center py-4">
              <LabelSmall className="!text-[var(--color-text)]">
                Loading more...
              </LabelSmall>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default Albums;
