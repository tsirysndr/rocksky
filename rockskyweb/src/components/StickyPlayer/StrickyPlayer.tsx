import styled from "@emotion/styled";
import { ProgressBar } from "baseui/progress-bar";
import { LabelSmall } from "baseui/typography";
import { useRef } from "react";
import { Link as DefaultLink } from "react-router-dom";
import { useTimeFormat } from "../../hooks/useFormat";
import Equalizer from "../Icons/Equalizer";
import Heart from "../Icons/Heart";
import HeartOutline from "../Icons/HeartOutline";
import Next from "../Icons/Next";
import Pause from "../Icons/Pause";
import Play from "../Icons/Play";
import Playlist from "../Icons/Playlist";
import Previous from "../Icons/Previous";
import Speaker from "../Icons/Speaker";
import {
  Button,
  Controls,
  LikeButton,
  MainWrapper,
  NextButton,
  PlayButton,
  PreviousButton,
  ProgressbarContainer,
  RightActions,
  styles,
} from "./styles";

const Container = styled.div`
  position: fixed;
  bottom: 0;
  z-index: 1;
  align-items: center;
  display: flex;
  height: 128px;
`;

const MiniPlayerWrapper = styled.div`
  padding: 24px;
`;

const MiniPlayer = styled.div`
  background-color: white;
  width: 1120px;
  height: 80px;
  padding: 16px;
  border-radius: 16px;
  box-shadow: 0px 0px 24px rgba(19, 19, 19, 0.08);
  display: flex;
  flex-direction: row;
  align-items: center;

  @media (max-width: 1120px) {
    width: 100vw;
  }
`;

const Cover = styled.img`
  width: 54px;
  height: 54px;
  margin-right: 16px;
  border-radius: 5px;
`;

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

export type StickyPlayerProps = {
  nowPlaying?: {
    title: string;
    artist: string;
    artistUri: string;
    songUri: string;
    albumUri: string;
    duration: number;
    progress: number;
    albumArt?: string;
    liked: boolean;
    sha256: string;
  } | null;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSpeaker: () => void;
  onEqualizer: () => void;
  onPlaylist: () => void;
  onSeek: (position: number) => void;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  isPlaying: boolean;
};

function StickyPlayer(props: StickyPlayerProps) {
  const {
    nowPlaying,
    onPlay,
    onPause,
    onPrevious,
    onNext,
    onSpeaker,
    onEqualizer,
    onPlaylist,
    onSeek,
    onLike,
    onDislike,
    isPlaying,
  } = props;
  const progressbarRef = useRef<HTMLDivElement>(null);
  const { formatTime } = useTimeFormat();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSeek = (e: any) => {
    if (progressbarRef.current) {
      const rect = progressbarRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left < 0 ? 0 : e.clientX - rect.left;
      const width = rect.width;
      const percentage = (x / width) * 100;
      const time = (percentage / 100) * nowPlaying!.duration;
      onSeek(Math.floor(time));
    }
  };

  if (!nowPlaying) {
    return <></>;
  }

  return (
    <Container>
      <MiniPlayerWrapper>
        <MiniPlayer className="!bg-[var(--color-background)]">
          {nowPlaying?.albumUri && (
            <Link to={`/${nowPlaying.albumUri.split("at://")[1]}`}>
              <Cover src={nowPlaying?.albumArt} key={nowPlaying.albumUri} />
            </Link>
          )}
          {!nowPlaying?.albumUri && (
            <Cover src={nowPlaying?.albumArt} key={nowPlaying.albumUri} />
          )}
          <div className="max-w-[310px] overflow-hidden">
            <div className="max-w-[310px] text-ellipsis overflow-hidden">
              {!!nowPlaying?.songUri && (
                <Link
                  to={`/${nowPlaying?.songUri?.split("at://")[1]}`}
                  style={{
                    fontWeight: 600,
                  }}
                  className="text-ellipsis text-nowrap"
                >
                  {nowPlaying?.title}
                </Link>
              )}
              {!nowPlaying?.songUri && (
                <div
                  style={{
                    fontWeight: 600,
                  }}
                  className="text-ellipsis text-nowrap"
                >
                  {nowPlaying?.title}
                </div>
              )}
            </div>
            <div className="max-w-[310px] overflow-hidden text-ellipsis">
              {!!nowPlaying?.artistUri && (
                <Link
                  to={`/${nowPlaying?.artistUri?.split("at://")[1]}`}
                  style={{
                    fontFamily: "RockfordSansLight",
                    fontWeight: 600,
                  }}
                  className="!text-[var(--color-text-muted)] text-ellipsis text-nowrap"
                >
                  {nowPlaying?.artist}
                </Link>
              )}
              {!nowPlaying?.artistUri && (
                <div
                  style={{
                    fontFamily: "RockfordSansLight",
                    fontWeight: 600,
                  }}
                  className="text-[var(--color-text-muted)] text-ellipsis text-nowrap"
                >
                  {nowPlaying?.artist}
                </div>
              )}
            </div>
          </div>
          <div className="mt-[-14px] ml-[16px]">
            <LikeButton
              onClick={() => {
                if (nowPlaying?.liked) {
                  onDislike(nowPlaying!.songUri);
                  return;
                }
                onLike(nowPlaying!.songUri);
              }}
            >
              {nowPlaying?.liked && <Heart color="var(--color-primary)" />}
              {!nowPlaying?.liked && <HeartOutline color="var(--color-text)" />}
            </LikeButton>
          </div>
          <div className="ml-[16px]">
            <div className="h-[45px]"></div>
            <LabelSmall className="!text-[var(--color-text)]">
              {formatTime(nowPlaying?.progress || 0)}
            </LabelSmall>
          </div>
          <MainWrapper>
            <Controls>
              <PreviousButton onClick={onPrevious}>
                <Previous color="var(--color-text)" />
              </PreviousButton>
              {!isPlaying && (
                <PlayButton onClick={onPlay}>
                  <Play color="var(--color-text)" small />
                </PlayButton>
              )}
              {isPlaying && (
                <PlayButton onClick={onPause}>
                  <Pause color="var(--color-text)" small />
                </PlayButton>
              )}
              <NextButton onClick={onNext}>
                <Next color="var(--color-text)" />
              </NextButton>
            </Controls>
            <div>
              <ProgressbarContainer ref={progressbarRef} onClick={handleSeek}>
                <ProgressBar
                  value={
                    nowPlaying?.progress && nowPlaying?.duration
                      ? (nowPlaying.progress / nowPlaying.duration) * 100
                      : 0
                  }
                  overrides={styles.Progressbar}
                />
              </ProgressbarContainer>
            </div>
          </MainWrapper>
          <div className="mr-[16px]">
            <div className="h-[45px]"></div>
            <LabelSmall className="!text-[var(--color-text)]">
              {formatTime(nowPlaying?.duration || 0)}
            </LabelSmall>
          </div>
          <RightActions>
            <Button
              onClick={onSpeaker}
              disabled
              className="!bg-[var(--color-background)] !text-[var(--color-text)]"
            >
              <Speaker />
            </Button>
            <Button onClick={onEqualizer} disabled>
              <Equalizer />
            </Button>
            <Button onClick={onPlaylist} disabled>
              <Playlist />
            </Button>
          </RightActions>
        </MiniPlayer>
      </MiniPlayerWrapper>
    </Container>
  );
}

export default StickyPlayer;
