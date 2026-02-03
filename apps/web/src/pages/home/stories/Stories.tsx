import styled from "@emotion/styled";
import { ChevronLeft, ChevronRight } from "@styled-icons/evaicons-solid";
import { Link as DefaultLink } from "@tanstack/react-router";
import { Modal, ModalBody, ModalHeader, ROLE } from "baseui/modal";
import { ProgressBar } from "baseui/progress-bar";
import { StatefulTooltip } from "baseui/tooltip";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { useEffect, useState, useRef } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconUser,
} from "@tabler/icons-react";
import { useStoriesQuery } from "../../../hooks/useStories";
import styles, { getModalStyles } from "./styles";
import _ from "lodash";
import ContentLoader from "react-content-loader";
import { v4 } from "uuid";

dayjs.extend(relativeTime);
dayjs.extend(utc);

const Container = styled.div`
  margin-bottom: 50px;
`;

const Story = styled.img`
  height: 64px;
  width: 64px;
  border-radius: 36px;
  border: 2px solid rgb(255, 40, 118);
  padding: 2px;
  cursor: pointer;
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
`;

const Cover = styled.img`
  width: 500px;
  height: 500px;
`;

const TrackTitle = styled.div`
  font-size: 20px;
  font-weight: bold;
  margin-top: 25px;
  color: #fff;
  width: 500px;
  text-align: center;
  text-decoration: none;
`;

const TrackArtist = styled.div`
  font-size: 18px;
  margin-top: 10px;
  color: #fff;
  width: 500px;
  text-align: center;
  text-decoration: none;
  opacity: 0.6;
  &:hover {
    text-decoration: underline;
  }
`;

const Avatar = styled.img`
  width: 48px;
  height: 48px;
  border-radius: 24px;
  margin-right: 15px;
`;

const Link = styled(DefaultLink)`
  text-decoration: none;
`;

function Stories() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: rawStories, isLoading } = useStoriesQuery();

  // Deduplicate by trackId + did (user) + createdAt to ensure truly unique entries
  const stories = _.uniqBy(
    rawStories || [],
    (item) => `${item.trackId}-${item.did}-${item.createdAt}`,
  );

  const [currentlyPlaying, setCurrentlyPlaying] = useState<{
    id: string;
    title: string;
    artist: string;
    albumArt: string;
    artistUri?: string;
    uri: string;
    avatar: string;
    handle: string;
    did: string;
    createdAt: string;
    trackId: string;
    trackUri: string;
  } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showLeftChevron, setShowLeftChevron] = useState(false);
  const [showRightChevron, setShowRightChevron] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const onNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= stories!.length) {
      setIsOpen(false);
      return;
    }

    setCurrentIndex(nextIndex);
    setCurrentlyPlaying(stories![nextIndex]);
    setProgress(0);
  };

  const onPrev = () => {
    const prevIndex = currentIndex - 1;

    if (prevIndex < 0) {
      setIsOpen(false);
      return;
    }

    setCurrentIndex(prevIndex);
    setCurrentlyPlaying(stories![prevIndex]);
    setProgress(0);
  };

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

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      setCurrentIndex(0);
      return;
    }
    const progressInterval = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + 1;
      });
    }, 100);

    return () => {
      clearInterval(progressInterval);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!stories) {
      return;
    }

    if (progress >= 100) {
      setProgress(0);
      const nextIndex = (currentIndex + 1) % stories.length;
      setCurrentIndex(nextIndex);
      setCurrentlyPlaying(stories[nextIndex]);

      if (nextIndex === 0) {
        setIsOpen(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, stories]);

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
                    key={v4()}
                    onClick={() => {
                      setCurrentlyPlaying(item);
                      setCurrentIndex(index);
                      setIsOpen(true);
                    }}
                  >
                    {item.avatar && !item.avatar.endsWith("/@jpeg") && (
                      <Story src={item.avatar} />
                    )}
                    {item.avatar && item.avatar.endsWith("/@jpeg") && (
                      <div className="w-[64px] h-[64px] rounded-full border-2 border-[rgb(255,40,118)] p-[2px]">
                        <div className="w-[64px] h-[64px] rounded-full bg-[var(--color-avatar-background)] flex items-center justify-center mr-[12px]">
                          <IconUser size={32} color="#fff" />
                        </div>
                      </div>
                    )}
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

          <Modal
            onClose={() => setIsOpen(false)}
            closeable
            isOpen={isOpen}
            animate
            autoFocus={false}
            size={"60vw"}
            role={ROLE.dialog}
            overrides={getModalStyles(currentlyPlaying?.albumArt).modal}
          >
            <ModalHeader className="text-[#fff] text-[15px]">
              <div className="w-[380px] mx-auto">
                <ProgressBar value={progress} overrides={styles.progressbar} />
              </div>
              <div className="flex flex-row items-center">
                <Link to={`/profile/${currentlyPlaying?.handle}`}>
                  {currentlyPlaying?.avatar &&
                    !currentlyPlaying?.avatar?.endsWith("/@jpeg") && (
                      <Avatar src={currentlyPlaying?.avatar} />
                    )}
                  {currentlyPlaying?.avatar &&
                    currentlyPlaying.avatar.endsWith("/@jpeg") && (
                      <div className="w-[48px] h-[48px] rounded-full bg-[var(--color-avatar-background)] flex items-center justify-center mr-[12px]">
                        <IconUser size={24} color="#fff" />
                      </div>
                    )}
                </Link>
                <Link to={`/profile/${currentlyPlaying?.handle}`}>
                  <div className="text-[#fff] no-underline text-[15px]">
                    @{currentlyPlaying?.handle}
                  </div>
                </Link>
                <span
                  className="ml-[10px] text-[15px]"
                  style={{ color: "rgba(255, 255, 255, 0.7)" }}
                >
                  {dayjs.utc(currentlyPlaying?.createdAt).local().fromNow()}
                </span>
              </div>
            </ModalHeader>
            <ModalBody className="flex flex-col items-center justify-center mb-[100px]">
              <div className="flex flex-row flex-1 w-[60vw]">
                <div className="flex items-center h-[500px] w-[50px] ">
                  {currentIndex > 0 && (
                    <div style={{ cursor: "pointer" }} onClick={onPrev}>
                      <ChevronLeft size={50} color="rgba(255, 255, 255, 0.5)" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center flex-1">
                  {currentlyPlaying?.trackUri && (
                    <Link
                      to={`/${currentlyPlaying?.trackUri.split("at://")[1].replace("app.rocksky.", "")}`}
                    >
                      <Cover
                        src={currentlyPlaying?.albumArt}
                        key={currentlyPlaying?.id}
                      />
                    </Link>
                  )}
                  {currentlyPlaying?.trackUri && (
                    <Link
                      to={`/${currentlyPlaying?.trackUri.split("at://")[1].replace("app.rocksky.", "")}`}
                    >
                      <TrackTitle>{currentlyPlaying?.title}</TrackTitle>
                    </Link>
                  )}
                  {!currentlyPlaying?.trackUri && (
                    <Cover
                      src={currentlyPlaying?.albumArt}
                      key={currentlyPlaying?.id}
                    />
                  )}
                </div>
                <div className="flex items-center h-[500px] w-[50px]">
                  {currentIndex < (stories || []).length - 1 && (
                    <div className="cursor-pointer" onClick={onNext}>
                      <ChevronRight
                        size={50}
                        color="rgba(255, 255, 255, 0.5)"
                      />
                    </div>
                  )}
                </div>
              </div>

              {!currentlyPlaying?.trackUri && (
                <TrackTitle>{currentlyPlaying?.title}</TrackTitle>
              )}
              <Link
                to={`/${currentlyPlaying?.artistUri?.split("at://")[1].replace("app.rocksky.", "")}`}
              >
                <TrackArtist>{currentlyPlaying?.artist}</TrackArtist>
              </Link>
            </ModalBody>
          </Modal>
        </>
      )}
    </Container>
  );
}

export default Stories;
