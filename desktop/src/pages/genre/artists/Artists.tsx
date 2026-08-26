import { Link, useParams } from "@tanstack/react-router";
import { uriToPath } from "../../../lib/uri";
import { useArtistsByGenreInfiniteQuery } from "../../../hooks/useLibrary";
import { FlexGridItem } from "baseui/flex-grid";
import ResponsiveFlexGrid from "../../../components/ResponsiveFlexGrid";
import { BlockProps } from "baseui/block";
import numeral from "numeral";
import { useEffect, useRef } from "react";
import { LabelSmall } from "baseui/typography";
import ArtistIcon from "../../../components/Icons/Artist";
import ContentLoader from "react-content-loader";

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
      {isLoading && (
        <ResponsiveFlexGrid
          flexGridColumnGap="scale800"
          flexGridRowGap="scale1000"
          className="mt-[50px]"
        >
          {/* Generate 9 skeleton items (3x3 grid) */}
          {[...Array(9)].map((_, index) => (
            <FlexGridItem {...itemProps} key={index}>
              <ContentLoader
                width={200}
                height={250}
                viewBox="0 0 200 250"
                backgroundColor="var(--color-skeleton-background)"
                foregroundColor="var(--color-skeleton-foreground)"
              >
                {/* Circle for artist avatar */}
                <circle cx="100" cy="100" r="100" />
                {/* Artist name */}
                <rect x="50" y="220" rx="3" ry="3" width="100" height="12" />
                {/* Play count */}
                <rect x="60" y="240" rx="3" ry="3" width="80" height="10" />
              </ContentLoader>
            </FlexGridItem>
          ))}
        </ResponsiveFlexGrid>
      )}
      {!isLoading && (
        <>
          <ResponsiveFlexGrid
            flexGridColumnGap="scale800"
            flexGridRowGap="scale1000"
            className="mt-[50px]"
          >
            {allArtists.map((artist) => (
              <FlexGridItem {...itemProps} key={artist.id}>
                <div className="flex flex-col items-center">
                  <Link
                    to={uriToPath(artist.uri)}
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
                      <div className="w-[200px] h-[200px] rounded-[80px] bg-[rgba(243, 243, 243, 0.725)] flex items-center justify-center mb-[20px]">
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
                    to={uriToPath(artist.uri)}
                    className="!text-[var(--color-text)] no-underline"
                  >
                    <b>{artist.name}</b>
                  </Link>
                  <span className="!text-[var(--color-text-muted)] text-[14px]">
                    <span style={{ fontFamily: "var(--font-mono)" }}>{numeral(artist.playCount).format("0,0")}</span> plays
                  </span>
                </div>
              </FlexGridItem>
            ))}
          </ResponsiveFlexGrid>

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
