import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconUser,
} from "@tabler/icons-react";
import _ from "lodash";
import ContentLoader from "react-content-loader";
import { useAtomValue } from "jotai";
import {
  feedAtom,
  feedGeneratorUriAtom,
  followingFeedAtom,
} from "../../atoms/feed";
import { useStoriesQuery, type Story } from "../../hooks/useStories";

import StoryViewer from "../StoryViewer";

function StoryAvatar({ item, onClick }: { item: Story; onClick: () => void }) {
  return (
    <div
      className="flex flex-col items-center flex-shrink-0 cursor-pointer mr-4"
      onClick={onClick}
      style={{ width: 72 }}
    >
      <div
        className="w-16 h-16 rounded-full p-0.5 flex-shrink-0"
        style={{ border: "2px solid var(--color-primary)" }}
      >
        {item.avatar && !item.avatar.endsWith("/@jpeg") ? (
          <img
            src={item.avatar}
            alt={item.handle}
            className="w-full h-full rounded-full object-cover"
            style={{ backgroundColor: "var(--color-skeleton-background)" }}
          />
        ) : (
          <div
            className="w-full h-full rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--color-avatar-background)" }}
          >
            <IconUser size={28} color="#fff" />
          </div>
        )}
      </div>
      <span
        className="text-[11px] mt-1 truncate w-full text-center"
        style={{
          color: "var(--color-text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {item.handle}
      </span>
    </div>
  );
}

export default function Stories() {
  const activeCategory = useAtomValue(feedAtom);
  const followingFeed = useAtomValue(followingFeedAtom);
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const filter = useMemo(() => {
    if (followingFeed) return { following: true };
    if (activeCategory === "all") return {};
    return { feed: feedUri };
  }, [activeCategory, followingFeed, feedUri]);
  const { data: rawStories, isLoading, isFetching } = useStoriesQuery(filter);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stories = _.uniqBy(
    rawStories || [],
    (s) => `${s.trackId}-${s.did}-${s.createdAt}`,
  );

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setHasOverflow(scrollWidth > clientWidth);
    setShowLeft(scrollLeft > 10);
    setShowRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      left: el.scrollLeft + (dir === "left" ? -300 : 300),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    handleScroll();
    window.addEventListener("resize", handleScroll);
    return () => window.removeEventListener("resize", handleScroll);
  }, [stories]);

  if (isLoading || (isFetching && !stories.length)) {
    return (
      <div className="overflow-hidden px-4 pt-4 pb-2">
        <ContentLoader
          width="100%"
          height={90}
          viewBox="0 0 400 90"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <circle cx={40 + i * 80} cy={36} r={32} />
              <rect
                x={16 + i * 80}
                y={76}
                rx={3}
                ry={3}
                width={48}
                height={10}
              />
            </g>
          ))}
        </ContentLoader>
      </div>
    );
  }

  if (!stories.length) return null;

  const maskImage = hasOverflow
    ? showLeft && showRight
      ? "linear-gradient(to right, transparent, black 30px, black calc(100% - 30px), transparent)"
      : showLeft
        ? "linear-gradient(to right, transparent, black 30px, black 100%)"
        : showRight
          ? "linear-gradient(to right, black 0%, black calc(100% - 30px), transparent)"
          : undefined
    : undefined;

  return (
    <>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <div
        className="relative flex items-center pt-4 pb-2"
        style={{ height: 110 }}
      >
        {showLeft && (
          <button
            onClick={() => scroll("left")}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-none bg-transparent cursor-pointer mb-5"
          >
            <IconChevronLeft size={18} style={{ color: "var(--color-text)" }} />
          </button>
        )}
        <div
          className="relative flex-1 overflow-hidden h-full"
          style={{ maskImage, WebkitMaskImage: maskImage }}
        >
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex overflow-x-auto no-scrollbar px-4 h-full items-start pt-1"
          >
            {stories.map((item, i) => (
              <StoryAvatar
                key={`${item.id}-${item.did}-${item.createdAt}`}
                item={item}
                onClick={() => setModalIndex(i)}
              />
            ))}
          </div>
        </div>
        {showRight && (
          <button
            onClick={() => scroll("right")}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-none bg-transparent cursor-pointer mb-5"
          >
            <IconChevronRight
              size={18}
              style={{ color: "var(--color-text)" }}
            />
          </button>
        )}
      </div>

      {modalIndex !== null && (
        <StoryViewer
          stories={stories}
          startIndex={modalIndex}
          onClose={() => setModalIndex(null)}
        />
      )}
    </>
  );
}
