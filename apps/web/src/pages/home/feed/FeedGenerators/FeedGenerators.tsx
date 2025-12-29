import { useState, useRef, useEffect } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { categories } from "./constants";
import { useAtom } from "jotai";
import {
  feedAtom,
  feedGeneratorUriAtom,
  feedUrisAtom,
} from "../../../../atoms/feed";
import { useFeedGeneratorsQuery } from "../../../../hooks/useFeed";
import * as R from "ramda";

function FeedGenerators() {
  const jwt = localStorage.getItem("token");
  const { data: feedGenerators } = useFeedGeneratorsQuery();
  const [feedUris, setFeedUris] = useAtom(feedUrisAtom);
  const [, setFeedUri] = useAtom(feedGeneratorUriAtom);
  const [activeCategory, setActiveCategory] = useAtom(feedAtom);
  const [showLeftChevron, setShowLeftChevron] = useState(false);
  const [showRightChevron, setShowRightChevron] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!feedGenerators?.feeds) {
      return;
    }
    const feedRegistry = R.indexBy(
      R.prop("name"),
      feedGenerators.feeds
        .map((x) => ({
          ...x,
          name: x.name.toLowerCase(),
        }))
        .filter((x) => categories.includes(x.name)),
    );
    setFeedUris(R.map(R.prop("uri"), feedRegistry));
  }, [feedGenerators, setFeedUris]);

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

    const scrollAmount = 200;
    const newScrollLeft =
      direction === "left"
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: "smooth",
    });
  };

  const handleCategoryClick = (category: string, index: number) => {
    setActiveCategory(category);
    setFeedUri(feedUris[category]);

    const container = scrollContainerRef.current;
    if (container) {
      const buttons = container.children;
      const button = buttons[index] as HTMLElement;

      if (button) {
        const containerWidth = container.offsetWidth;
        const buttonLeft = button.offsetLeft;
        const buttonWidth = button.offsetWidth;

        // Center the clicked button
        const scrollPosition =
          buttonLeft - containerWidth / 2 + buttonWidth / 2;
        container.scrollTo({
          left: scrollPosition,
          behavior: "smooth",
        });
      }
    }
  };

  // Check overflow on mount and window resize
  useEffect(() => {
    handleScroll();

    const handleResize = () => {
      handleScroll();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      className={`sticky ${jwt ? "top-[80px]" : "top-[80px]"} bg-[var(--color-background)] z-50`}
    >
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      <div className="bg-[var(--color-background)]">
        <div className="relative h-[50px] flex items-center">
          {/* Left chevron */}
          {showLeftChevron && (
            <button
              onClick={() => scroll("left")}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-transparent hover:bg-[var(--color-input-background)] flex items-center justify-center transition-all outline-none border-none cursor-pointer shadow-md z-30 h-[30px] w-[30px] mt-[3px]"
            >
              <IconChevronLeft size={16} className="text-[var(--color-text)]" />
            </button>
          )}

          <div
            className="relative flex-1 overflow-hidden"
            style={
              hasOverflow
                ? {
                    maskImage:
                      showLeftChevron && showRightChevron
                        ? "linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent)"
                        : showLeftChevron
                          ? "linear-gradient(to right, transparent, black 40px, black 100%)"
                          : showRightChevron
                            ? "linear-gradient(to right, black 0%, black calc(100% - 40px), transparent)"
                            : undefined,
                    WebkitMaskImage:
                      showLeftChevron && showRightChevron
                        ? "linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent)"
                        : showLeftChevron
                          ? "linear-gradient(to right, transparent, black 40px, black 100%)"
                          : showRightChevron
                            ? "linear-gradient(to right, black 0%, black calc(100% - 40px), transparent)"
                            : undefined,
                  }
                : undefined
            }
          >
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex gap-[8px] overflow-x-auto no-scrollbar px-4 py-3 h-full"
            >
              {categories.map((category, index) => (
                <button
                  key={category}
                  onClick={() => handleCategoryClick(category, index)}
                  className={`
                  relative flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium
                  transition-all duration-200 whitespace-nowrap outline-none border-none p-[8px] pl-[12px] pr-[12px] cursor-pointer
                  ${
                    activeCategory === category
                      ? "bg-[var(--color-input-background)] text-[var(--color-text)]"
                      : "bg-transparent text-[var(--color-text)] hover:bg-[var(--color-input-background)]"
                  }
                `}
                >
                  {category}
                  {/* Active indicator underline */}
                  {activeCategory === category && (
                    <div className="absolute bottom-[-12px] left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-[var(--color-primary)]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right chevron */}
          {showRightChevron && (
            <button
              onClick={() => scroll("right")}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-transparent hover:bg-[var(--color-input-background)] flex items-center justify-center transition-all outline-none border-none cursor-pointer shadow-md z-30 h-[30px] w-[30px] mt-[3px]"
            >
              <IconChevronRight
                size={16}
                className="text-[var(--color-text)]"
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default FeedGenerators;
