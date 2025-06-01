import styled from "@emotion/styled";
import { ChevronLeft, ChevronRight } from "@styled-icons/evaicons-solid";
import { Modal, ModalBody, ModalHeader, ROLE } from "baseui/modal";
import { ProgressBar } from "baseui/progress-bar";
import { StatefulTooltip } from "baseui/tooltip";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { useEffect, useState } from "react";
import { Link as DefaultLink } from "react-router";
import { useNowPlayingsQuery } from "../../../hooks/useNowPlaying";
import styles from "./styles";

dayjs.extend(relativeTime);
dayjs.extend(utc);

const Container = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
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

function NowPlayings() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: nowPlayings, isLoading } = useNowPlayingsQuery();
  const [currentlyPlaying, setCurrentlyPlaying] = useState<{
    id: string;
    title: string;
    artist: string;
    album_art: string;
    artist_uri?: string;
    uri: string;
    avatar: string;
    handle: string;
    did: string;
    created_at: string;
    track_id: string;
    track_uri: string;
  } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const onNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= nowPlayings!.length) {
      setIsOpen(false);
      return;
    }

    setCurrentIndex(nextIndex);
    setCurrentlyPlaying(nowPlayings![nextIndex]);
    setProgress(0);
  };

  const onPrev = () => {
    const prevIndex = currentIndex - 1;

    if (prevIndex < 0) {
      setIsOpen(false);
      return;
    }

    setCurrentIndex(prevIndex);
    setCurrentlyPlaying(nowPlayings![prevIndex]);
    setProgress(0);
  };

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      setCurrentIndex(0);
      return;
    }
    const progressInterval = setInterval(() => {
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
    if (!nowPlayings) {
      return;
    }

    if (progress >= 100) {
      setProgress(0);
      const nextIndex = (currentIndex + 1) % nowPlayings.length;
      setCurrentIndex(nextIndex);
      setCurrentlyPlaying(nowPlayings[nextIndex]);

      if (nextIndex === 0) {
        setIsOpen(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, nowPlayings]);

  return (
    <Container>
      {!isLoading && (
        <>
          {(nowPlayings || []).map((item, index) => (
            <StoryContainer
              key={item.id}
              onClick={() => {
                setCurrentlyPlaying(item);
                setCurrentIndex(index);
                setIsOpen(true);
              }}
            >
              <Story src={item.avatar} />
              <StatefulTooltip content={item.handle} returnFocus autoFocus>
                <Handle>{item.handle}</Handle>
              </StatefulTooltip>
            </StoryContainer>
          ))}
          <Modal
            onClose={() => setIsOpen(false)}
            closeable
            isOpen={isOpen}
            animate
            autoFocus={false}
            size={"60vw"}
            role={ROLE.dialog}
            overrides={styles.modal}
          >
            <ModalHeader className="text-[#fff] text-[15px]">
              <div className="w-[380px] mx-auto">
                <ProgressBar value={progress} overrides={styles.progressbar} />
              </div>
              <div className="flex flex-row items-center">
                <Link to={`/profile/${currentlyPlaying?.handle}`}>
                  <Avatar src={currentlyPlaying?.avatar} />
                </Link>
                <Link to={`/profile/${currentlyPlaying?.handle}`}>
                  <div className="text-[#fff] no-underline text-[15px]">
                    @{currentlyPlaying?.handle}
                  </div>
                </Link>
                <span className="ml-[10px] text-[15px] text-[var(--color-text-muted)]">
                  {dayjs.utc(currentlyPlaying?.created_at).local().fromNow()}
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
                  {currentlyPlaying?.track_uri && (
                    <Link
                      to={`/${currentlyPlaying?.track_uri.split("at://")[1]}`}
                    >
                      <Cover
                        src={currentlyPlaying?.album_art}
                        key={currentlyPlaying?.id}
                      />
                    </Link>
                  )}
                  {currentlyPlaying?.track_uri && (
                    <Link
                      to={`/${currentlyPlaying?.track_uri.split("at://")[1]}`}
                    >
                      <TrackTitle>{currentlyPlaying?.title}</TrackTitle>
                    </Link>
                  )}
                  {!currentlyPlaying?.track_uri && (
                    <Cover
                      src={currentlyPlaying?.album_art}
                      key={currentlyPlaying?.id}
                    />
                  )}
                </div>
                <div className="flex items-center h-[500px] w-[50px]">
                  {currentIndex < (nowPlayings || []).length - 1 && (
                    <div className="cursor-pointer" onClick={onNext}>
                      <ChevronRight
                        size={50}
                        color="rgba(255, 255, 255, 0.5)"
                      />
                    </div>
                  )}
                </div>
              </div>

              {!currentlyPlaying?.track_uri && (
                <TrackTitle>{currentlyPlaying?.title}</TrackTitle>
              )}
              <Link to={`/${currentlyPlaying?.artist_uri?.split("at://")[1]}`}>
                <TrackArtist>{currentlyPlaying?.artist}</TrackArtist>
              </Link>
            </ModalBody>
          </Modal>
        </>
      )}
    </Container>
  );
}

export default NowPlayings;
