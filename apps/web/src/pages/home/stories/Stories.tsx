import StoryViewer from "../../../components/StoryViewer";
import UserAvatar from "../../../components/UserAvatar";
import styled from "@emotion/styled";
import { StatefulTooltip } from "baseui/tooltip";
import { useEffect, useMemo, useState, useRef } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { feedAtom, feedGeneratorUriAtom } from "../../../atoms/feed";
import { followingFeedAtom } from "../../../atoms/followingFeed";
import { useStoriesQuery } from "../../../hooks/useStories";
import _ from "lodash";
import ContentLoader from "react-content-loader";

const Container = styled.div`
  margin-bottom: 50px;
`;

const StoryContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 20px;
  cursor: pointer;
  flex-shrink: 0;
`;

const Handle = styled.div`
  text-overflow: ellipsis;
  overflow: hidden;
  width: 90px;
  font-size: 13px;
  white-space: nowrap;
  margin-top: 5px;
  text-align: center;
  font-family: var(--font-mono);
`;

function Stories() {
  const [isOpen, setIsOpen] = useState(false);
  const activeCategory = useAtomValue(feedAtom);
  const followingFeed = useAtomValue(followingFeedAtom);
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const filter = useMemo(() => {
    if (followingFeed) return { following: true };
    if (activeCategory === "all") return {};
    return { feed: feedUri };
  }, [activeCategory, followingFeed, feedUri]);
  const { data: rawStories, isLoading } = useStoriesQuery(filter);

  // Deduplicate by trackId + did (user) + createdAt to ensure truly unique entries
  const stories = _.uniqBy(
    rawStories || [],
    (item) => `${item.trackId}-${item.did}-${item.createdAt}`,
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLeftChevron, setShowLeftChevron] = useState(false);
  const [showRightChevron, setShowRightChevron] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Check scroll position and update chevron visibility
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;

    // Check if content overflows
    const overflow = scrollWidth > clientWidth;
    setHasOverflow(overflow);

    // Show left chevron if scrolled from the start
    setShowLeftChevron(scrollLeft > 10);

    // Show right chevron if not scrolled to the end
    setShowRightChevron(scrollLeft < scrollWidth - clientWidth - 10);
  };

  // Scroll left/right
  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = 300;
    const newScrollLeft =
      direction === "left"
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: "smooth",
    });
  };

  // Check overflow on mount and window resize
  useEffect(() => {
    handleScroll();

    const handleResize = () => {
      handleScroll();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [stories]);

  return (
    <Container>
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {isLoading && (
        <div className="flex overflow-x-hidden">
          <ContentLoader
            width="100%"
            height={100}
            viewBox="0 0 800 100"
            backgroundColor="var(--color-skeleton-background)"
            foregroundColor="var(--color-skeleton-foreground)"
          >
            {/* Story 1 */}
            <circle cx="40" cy="40" r="32" />
            <rect x="16" y="85" rx="3" ry="3" width="48" height="10" />

            {/* Story 2 */}
            <circle cx="140" cy="40" r="32" />
            <rect x="116" y="85" rx="3" ry="3" width="48" height="10" />

            {/* Story 3 */}
            <circle cx="240" cy="40" r="32" />
            <rect x="216" y="85" rx="3" ry="3" width="48" height="10" />

            {/* Story 4 */}
            <circle cx="340" cy="40" r="32" />
            <rect x="316" y="85" rx="3" ry="3" width="48" height="10" />

            {/* Story 5 */}
            <circle cx="440" cy="40" r="32" />
            <rect x="416" y="85" rx="3" ry="3" width="48" height="10" />

            {/* Story 6 */}
            <circle cx="540" cy="40" r="32" />
            <rect x="516" y="85" rx="3" ry="3" width="48" height="10" />

            {/* Story 7 */}
            <circle cx="640" cy="40" r="32" />
            <rect x="616" y="85" rx="3" ry="3" width="48" height="10" />

            {/* Story 8 */}
            <circle cx="740" cy="40" r="32" />
            <rect x="716" y="85" rx="3" ry="3" width="48" height="10" />
          </ContentLoader>
        </div>
      )}

      {!isLoading && (
        <>
          <div className="relative flex items-center h-[100px]">
            {/* Left chevron */}
            {showLeftChevron && (
              <button
                onClick={() => scroll("left")}
                className="flex-shrink-0 w-8 h-8 min-w-8 min-h-8 p-0 rounded-full bg-transparent hover:bg-[var(--color-input-background)] flex items-center justify-center transition-all outline-none border-none cursor-pointer shadow-md z-0 mt-[-20px]"
                style={{ padding: "5px" }}
              >
                <IconChevronLeft
                  size={20}
                  className="text-[var(--color-text)] flex-shrink-0"
                />
              </button>
            )}

            <div
              className="relative flex-1 overflow-hidden"
              style={
                hasOverflow
                  ? {
                      maskImage:
                        showLeftChevron && showRightChevron
                          ? "linear-gradient(to right, transparent, black 30px, black calc(100% - 30px), transparent)"
                          : showLeftChevron
                            ? "linear-gradient(to right, transparent, black 30px, black 100%)"
                            : showRightChevron
                              ? "linear-gradient(to right, black 0%, black calc(100% - 30px), transparent)"
                              : undefined,
                      WebkitMaskImage:
                        showLeftChevron && showRightChevron
                          ? "linear-gradient(to right, transparent, black 30px, black calc(100% - 30px), transparent)"
                          : showLeftChevron
                            ? "linear-gradient(to right, transparent, black 30px, black 100%)"
                            : showRightChevron
                              ? "linear-gradient(to right, black 0%, black calc(100% - 30px), transparent)"
                              : undefined,
                    }
                  : undefined
              }
            >
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex overflow-x-auto no-scrollbar h-full"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {stories.map((item, index) => (
                  <StoryContainer
                    key={`${item.id}-${item.did}-${item.createdAt}`}
                    onClick={() => {
                      setCurrentIndex(index);
                      setIsOpen(true);
                    }}
                  >
                    <div className="rounded-full border-2 border-[rgb(255,40,118)] p-[2px]">
                      <UserAvatar
                        src={item.avatar}
                        name={item.handle}
                        size={56}
                      />
                    </div>
                    <StatefulTooltip
                      content={item.handle}
                      returnFocus
                      autoFocus
                    >
                      <Handle>{item.handle}</Handle>
                    </StatefulTooltip>
                  </StoryContainer>
                ))}
              </div>
            </div>

            {/* Right chevron */}
            {showRightChevron && (
              <button
                onClick={() => scroll("right")}
                className="flex-shrink-0 w-8 h-8 min-w-8 min-h-8 p-0 rounded-full bg-transparent hover:bg-[var(--color-input-background)] flex items-center justify-center transition-all outline-none border-none cursor-pointer shadow-md z-0 mt-[-20px]"
                style={{ padding: "5px" }}
              >
                <IconChevronRight
                  size={20}
                  className="text-[var(--color-text)] flex-shrink-0"
                />
              </button>
            )}
          </div>

          {isOpen && (
            <StoryViewer
              stories={stories}
              startIndex={currentIndex}
              onClose={() => setIsOpen(false)}
            />
          )}
        </>
      )}
    </Container>
  );
}

export default Stories;
