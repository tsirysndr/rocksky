import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { useTopArtistsInfiniteQuery } from "../../../hooks/useLibrary";
import Artist from "../../../components/Icons/Artist";
import { getLastDays } from "../../../lib/date";
import dayjs from "dayjs";
import numeral from "numeral";
import { useEffect, useRef } from "react";
import { LabelSmall } from "baseui/typography";
import ContentLoader from "react-content-loader";

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
  const [startDate, endDate] = getLastDays(7);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useTopArtistsInfiniteQuery(20, startDate, endDate);
  const end = dayjs();
  const start = end.subtract(7, "day");
  const range = `${start.format("DD MMM YYYY")} — ${end.format("DD MMM YYYY")}`;

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
      <div className="mt-[15px] mb-[25px]">
        <strong>{range}</strong>
      </div>
      {isLoading && (
        <ContentLoader
          width="100%"
          height={500}
          viewBox="0 -10 800 500"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          {/* Header Row */}
          <rect x="0" y="0" rx="3" ry="3" width="100" height="15" />
          <rect x="600" y="0" rx="3" ry="3" width="100" height="15" />
          <rect x="750" y="0" rx="3" ry="3" width="100" height="15" />

          {/* Row 1 */}
          <rect x="0" y="60" rx="3" ry="3" width="30" height="15" />
          <circle cx="80" cy="70" r="30" />
          <rect x="130" y="60" rx="3" ry="3" width="250" height="15" />
          <rect x="600" y="60" rx="3" ry="3" width="80" height="15" />
          <rect x="750" y="60" rx="3" ry="3" width="80" height="15" />

          {/* Row 2 */}
          <rect x="0" y="140" rx="3" ry="3" width="30" height="15" />
          <circle cx="80" cy="150" r="30" />
          <rect x="130" y="140" rx="3" ry="3" width="250" height="15" />
          <rect x="600" y="140" rx="3" ry="3" width="80" height="15" />
          <rect x="750" y="140" rx="3" ry="3" width="80" height="15" />

          {/* Row 3 */}
          <rect x="0" y="220" rx="3" ry="3" width="30" height="15" />
          <circle cx="80" cy="230" r="30" />
          <rect x="130" y="220" rx="3" ry="3" width="250" height="15" />
          <rect x="600" y="220" rx="3" ry="3" width="80" height="15" />
          <rect x="750" y="220" rx="3" ry="3" width="80" height="15" />

          {/* Row 4 */}
          <rect x="0" y="300" rx="3" ry="3" width="30" height="15" />
          <circle cx="80" cy="310" r="30" />
          <rect x="130" y="300" rx="3" ry="3" width="250" height="15" />
          <rect x="600" y="300" rx="3" ry="3" width="80" height="15" />
          <rect x="750" y="300" rx="3" ry="3" width="80" height="15" />

          {/* Row 5 */}
          <rect x="0" y="380" rx="3" ry="3" width="30" height="15" />
          <circle cx="80" cy="390" r="30" />
          <rect x="130" y="380" rx="3" ry="3" width="250" height="15" />
          <rect x="600" y="380" rx="3" ry="3" width="80" height="15" />
          <rect x="750" y="380" rx="3" ry="3" width="80" height="15" />

          {/* Row 6 */}
          <rect x="0" y="460" rx="3" ry="3" width="30" height="15" />
          <circle cx="80" cy="470" r="30" />
          <rect x="130" y="460" rx="3" ry="3" width="250" height="15" />
          <rect x="600" y="460" rx="3" ry="3" width="80" height="15" />
          <rect x="750" y="460" rx="3" ry="3" width="80" height="15" />
        </ContentLoader>
      )}
      {!isLoading && (
        <>
          <TableBuilder
            data={allArtists?.map((x, index) => ({
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
                  opacity: "85%",
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
            <TableBuilderColumn header="ARTIST">
              {(row: ArtistRow) => (
                <div className="flex flex-row items-center">
                  <div>
                    <div className="mr-[20px] text-[var(--color-text)]">
                      {row.index + 1}
                    </div>
                  </div>
                  <a
                    href={`/${row.uri?.split("at://")[1]?.replace("app.rocksky.", "")}`}
                    className="no-underline !text-[var(--color-text)]"
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
            <TableBuilderColumn header="LISTENERS">
              {(row: ArtistRow) => (
                <div className="flex flex-row items-center">
                  {numeral(row.uniqueListeners).format("0,0")}
                </div>
              )}
            </TableBuilderColumn>
            <TableBuilderColumn header="SCROBBLES">
              {(row: ArtistRow) => (
                <div className="flex flex-row items-center">
                  {numeral(row.scrobbles).format("0,0")}
                </div>
              )}
            </TableBuilderColumn>
          </TableBuilder>

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

export default Weekly;
