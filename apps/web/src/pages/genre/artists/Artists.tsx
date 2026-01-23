import { Link, useParams } from "@tanstack/react-router";
import { useArtistsByGenreInfiniteQuery } from "../../../hooks/useLibrary";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { BlockProps } from "baseui/block";
import numeral from "numeral";
import { useEffect, useRef } from "react";
import { LabelSmall } from "baseui/typography";
import ArtistIcon from "../../../components/Icons/Artist";

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

function Artists() {
  const { id: genre } = useParams({ strict: false });
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useArtistsByGenreInfiniteQuery(genre!, 21);

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

  const allArtists = data?.pages.flatMap((page) => page.artists) ?? [];

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
            {allArtists.map((artist) => (
              <FlexGridItem {...itemProps} key={artist.id}>
                <div className="flex flex-col items-center">
                  <Link
                    to={
                      `/${artist.uri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                    }
                    className="text-initial"
                  >
                    {artist.picture && (
                      <img
                        src={artist.picture}
                        alt={artist.name}
                        className="w-[200px] h-[200px] rounded-full mb-[20px]"
                        key={artist.id}
                      />
                    )}
                    {!artist.picture && (
                      <div className="w-[200px] h-[200px] rounded-[80px] bg-[rgba(243, 243, 243, 0.725)] flex items-center justify-center">
                        <div
                          style={{
                            height: 60,
                            width: 60,
                          }}
                        >
                          <ArtistIcon color="rgba(66, 87, 108, 0.65)" />
                        </div>
                      </div>
                    )}
                  </Link>
                  <Link
                    to={
                      `/${artist.uri.split("at://")[1]?.replace("app.rocksky.", "")}` as string
                    }
                    className="!text-[var(--color-text)] no-underline"
                  >
                    <b>{artist.name}</b>
                  </Link>
                  <span className="!text-[var(--color-text-muted)] text-[14px]">
                    {numeral(artist.playCount).format("0,0")} plays
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

export default Artists;
