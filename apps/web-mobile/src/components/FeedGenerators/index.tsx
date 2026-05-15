import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { feedAtom, feedGeneratorUriAtom, feedUrisAtom, followingFeedAtom } from "../../atoms/feed";
import { useFeedGeneratorsQuery } from "../../hooks/useFeed";

const ALL_CATEGORIES = [
  "all", "following", "afrobeat", "afrobeats", "alternative metal", "anime",
  "art pop", "breakcore", "chicago drill", "chillwave", "country hip hop", "crunk",
  "dance pop", "deep house", "drill", "dubstep", "emo", "grunge", "hard rock",
  "heavy metal", "hip hop", "house", "hyperpop", "indie", "indie rock", "j-pop",
  "j-rock", "jazz", "k-pop", "lo-fi", "metal", "metalcore", "midwest emo",
  "nu metal", "pop punk", "post-grunge", "rap", "rap metal", "r&b", "rock",
  "southern hip hop", "speedcore", "swedish pop", "synthwave", "thrash metal",
  "trap", "trap soul", "tropical house", "vaporwave", "visual kei", "vocaloid",
  "west coast hip hop",
];

export default function FeedGenerators() {
  const isLoggedIn = !!localStorage.getItem("did");
  const categories = ALL_CATEGORIES.filter((c) => isLoggedIn || c !== "following");

  const { data: feedGenerators } = useFeedGeneratorsQuery();
  const [feedUris, setFeedUris] = useAtom(feedUrisAtom);
  const [, setFeedUri] = useAtom(feedGeneratorUriAtom);
  const [, setFollowingFeed] = useAtom(followingFeedAtom);
  const [activeCategory, setActiveCategory] = useAtom(feedAtom);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!feedGenerators?.feeds) return;
    const uriMap: Record<string, string> = {};
    feedGenerators.feeds.forEach((x: { name: string; uri: string }) => {
      const name = x.name.toLowerCase();
      if (categories.includes(name)) uriMap[name] = x.uri;
    });
    setFeedUris(uriMap);
    // Immediately apply the correct URI for the active category so feed loads on first render
    if (activeCategory !== "following" && uriMap[activeCategory]) {
      setFeedUri(uriMap[activeCategory]);
    } else if (uriMap["all"]) {
      setFeedUri(uriMap["all"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedGenerators]);

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
    el.scrollTo({ left: el.scrollLeft + (dir === "left" ? -200 : 200), behavior: "smooth" });
  };

  useEffect(() => {
    handleScroll();
    window.addEventListener("resize", handleScroll);
    return () => window.removeEventListener("resize", handleScroll);
  }, []);

  const handleClick = (category: string, index: number) => {
    setActiveCategory(category);
    if (category === "following") {
      setFollowingFeed(true);
    } else {
      setFeedUri(feedUris[category] || feedUris["all"]);
      setFollowingFeed(false);
    }
    const el = scrollRef.current;
    if (el) {
      const btn = el.children[index] as HTMLElement;
      if (btn) {
        el.scrollTo({
          left: btn.offsetLeft - el.offsetWidth / 2 + btn.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
  };

  const maskImage = hasOverflow
    ? showLeft && showRight
      ? "linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent)"
      : showLeft
        ? "linear-gradient(to right, transparent, black 40px, black 100%)"
        : showRight
          ? "linear-gradient(to right, black 0%, black calc(100% - 40px), transparent)"
          : undefined
    : undefined;

  return (
    <div className="sticky top-14 z-30" style={{ backgroundColor: "var(--color-background)" }}>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <div className="relative h-[50px] flex items-center border-b" style={{ borderColor: "var(--color-border)" }}>
        {showLeft && (
          <button
            onClick={() => scroll("left")}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-none bg-transparent cursor-pointer"
          >
            <IconChevronLeft size={16} style={{ color: "var(--color-text)" }} />
          </button>
        )}
        <div className="relative flex-1 overflow-hidden" style={{ maskImage, WebkitMaskImage: maskImage }}>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-2 overflow-x-auto no-scrollbar px-4 h-full items-center"
          >
            {categories.map((category, index) => (
              <button
                key={category}
                onClick={() => handleClick(category, index)}
                className="relative flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border-none cursor-pointer transition-all"
                style={{
                  backgroundColor: activeCategory === category ? "var(--color-surface-2)" : "transparent",
                  color: "var(--color-text)",
                }}
              >
                {category}
                {activeCategory === category && (
                  <div
                    className="absolute bottom-[-13px] left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--color-primary)" }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
        {showRight && (
          <button
            onClick={() => scroll("right")}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-none bg-transparent cursor-pointer"
          >
            <IconChevronRight size={16} style={{ color: "var(--color-text)" }} />
          </button>
        )}
      </div>
    </div>
  );
}
