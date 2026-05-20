import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconUser, IconX } from "@tabler/icons-react";
import type { TouchEvent } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import _ from "lodash";
import ContentLoader from "react-content-loader";
import { useStoriesQuery, type Story } from "../../hooks/useStories";

dayjs.extend(relativeTime);
dayjs.extend(utc);

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
          <img src={item.avatar} alt={item.handle} className="w-full h-full rounded-full object-cover" />
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
        style={{ color: "var(--color-text-muted)" }}
      >
        {item.handle}
      </span>
    </div>
  );
}

function StoryModal({
  stories,
  startIndex,
  onClose,
}: {
  stories: Story[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const current = stories[index];

  const goNext = () => {
    const next = index + 1;
    if (next >= stories.length) { onClose(); return; }
    setIndex(next);
  };
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  const handleTouchStart = (e: TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = touchStartY.current - e.changedTouches[0].clientY;
    touchStartY.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta > 0) goNext(); else goPrev();
  };

  useEffect(() => {
    setProgress(0);
  }, [index]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          goNext();
          return 0;
        }
        return p + 2;
      });
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const trackPath = current?.trackUri
    ? `/${current.trackUri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;
  const artistPath = current?.artistUri
    ? `/${current.artistUri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        backgroundColor: "#000",
        backgroundImage: current?.albumArt
          ? `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(${current.albumArt})`
          : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Progress bars — one segment per story */}
      <div className="flex gap-1 px-3 pt-3 pb-2">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full overflow-hidden bg-white/30">
            <div
              className="h-full bg-white transition-none"
              style={{ width: i < index ? "100%" : i === index ? `${progress}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2">
        <Link to={`/profile/${current?.did}`} onClick={onClose} className="flex items-center gap-2 no-underline flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--color-avatar-background)" }}>
            {current?.avatar && !current.avatar.endsWith("/@jpeg") ? (
              <img src={current.avatar} alt={current.handle} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <IconUser size={18} color="#fff" />
              </div>
            )}
          </div>
          <span className="text-sm font-medium text-white truncate">@{current?.handle}</span>
          <span className="text-xs flex-shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>
            {dayjs.utc(current?.createdAt).local().fromNow()}
          </span>
          <span className="text-xs flex-shrink-0 tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>
            {index + 1}/{stories.length}
          </span>
        </Link>
        <button
          onClick={onClose}
          className="border-none bg-transparent cursor-pointer p-1 flex-shrink-0"
        >
          <IconX size={22} color="#fff" />
        </button>
      </div>

      {/* Album art */}
      <div className="flex-1 flex items-center justify-center px-4 relative">
        {/* Prev tap zone */}
        <div className="absolute left-0 top-0 bottom-0 w-1/3 z-10" onClick={goPrev} />
        {/* Next tap zone */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 z-10" onClick={goNext} />
        {trackPath ? (
          <Link to={trackPath} onClick={onClose} className="block no-underline">
            {current?.albumArt ? (
              <img
                src={current.albumArt}
                alt={current?.title}
                className="rounded-2xl shadow-2xl object-cover"
                style={{ maxWidth: "min(80vw, 380px)", maxHeight: "55vh", width: "100%", height: "auto" }}
              />
            ) : (
              <div
                className="rounded-2xl flex items-center justify-center"
                style={{ width: "min(80vw, 380px)", height: "55vh", backgroundColor: "var(--color-menu-hover)", color: "var(--color-text-muted)", fontSize: 80 }}
              >
                ♪
              </div>
            )}
          </Link>
        ) : current?.albumArt ? (
          <img
            src={current.albumArt}
            alt={current?.title}
            className="rounded-2xl shadow-2xl object-cover"
            style={{ maxWidth: "min(80vw, 380px)", maxHeight: "55vh", width: "100%", height: "auto" }}
          />
        ) : (
          <div
            className="rounded-2xl flex items-center justify-center"
            style={{ width: "min(80vw, 380px)", height: "55vh", backgroundColor: "var(--color-menu-hover)", color: "var(--color-text-muted)", fontSize: 80 }}
          >
            ♪
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="px-4 pb-10 pt-4 text-center">
        {trackPath ? (
          <Link to={trackPath} onClick={onClose} className="no-underline block">
            <p className="text-xl font-bold text-white m-0 mb-1">{current?.title}</p>
          </Link>
        ) : (
          <p className="text-xl font-bold text-white m-0 mb-1">{current?.title}</p>
        )}
        {artistPath ? (
          <Link to={artistPath} onClick={onClose} className="no-underline">
            <p className="text-base m-0" style={{ color: "rgba(255,255,255,0.6)" }}>{current?.artist}</p>
          </Link>
        ) : (
          <p className="text-base m-0" style={{ color: "rgba(255,255,255,0.6)" }}>{current?.artist}</p>
        )}
      </div>
    </div>
  );
}

export default function Stories() {
  const { data: rawStories, isLoading } = useStoriesQuery();
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stories = _.uniqBy(rawStories || [], (s) => `${s.trackId}-${s.did}-${s.createdAt}`);

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
    el.scrollTo({ left: el.scrollLeft + (dir === "left" ? -300 : 300), behavior: "smooth" });
  };

  useEffect(() => {
    handleScroll();
    window.addEventListener("resize", handleScroll);
    return () => window.removeEventListener("resize", handleScroll);
  }, [stories]);

  if (isLoading) {
    return (
      <div className="overflow-hidden px-4 pt-4 pb-2">
        <ContentLoader
          width="100%"
          height={90}
          viewBox="0 0 400 90"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          {[0,1,2,3,4].map((i) => (
            <g key={i}>
              <circle cx={40 + i * 80} cy={36} r={32} />
              <rect x={16 + i * 80} y={76} rx={3} ry={3} width={48} height={10} />
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
      <div className="relative flex items-center pt-4 pb-2" style={{ height: 110 }}>
        {showLeft && (
          <button
            onClick={() => scroll("left")}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-none bg-transparent cursor-pointer mb-5"
          >
            <IconChevronLeft size={18} style={{ color: "var(--color-text)" }} />
          </button>
        )}
        <div className="relative flex-1 overflow-hidden h-full" style={{ maskImage, WebkitMaskImage: maskImage }}>
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
            <IconChevronRight size={18} style={{ color: "var(--color-text)" }} />
          </button>
        )}
      </div>

      {modalIndex !== null && (
        <StoryModal
          stories={stories}
          startIndex={modalIndex}
          onClose={() => setModalIndex(null)}
        />
      )}
    </>
  );
}
