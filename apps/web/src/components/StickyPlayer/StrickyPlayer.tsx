import styled from "@emotion/styled";
import { Link as DefaultLink } from "@tanstack/react-router";
import { IconArrowsShuffle, IconMaximize, IconMusic, IconRepeat, IconRepeatOnce } from "@tabler/icons-react";
import type { RepeatMode } from "../../atoms/playback";
import { ProgressBar } from "baseui/progress-bar";
import { LabelSmall } from "baseui/typography";
import { useRef, type RefObject } from "react";
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

const Container = styled.div<{ embedded?: boolean }>`
  ${({ embedded }) => embedded ? `
    width: 100%;
  ` : `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 128px;
  `}
`;

const MiniPlayerWrapper = styled.div<{ embedded?: boolean }>`
  padding: ${({ embedded }) => embedded ? "0 0 24px 0" : "24px"};
  width: ${({ embedded }) => embedded ? "100%" : "auto"};
  display: ${({ embedded }) => embedded ? "flex" : "block"};
  justify-content: ${({ embedded }) => embedded ? "center" : "initial"};
`;

const MiniPlayer = styled.div<{ embedded?: boolean }>`
  ${({ embedded }) => embedded ? `
    background: rgba(19, 8, 37, 0.25);
    backdrop-filter: blur(12px);
    width: 1120px;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    @media (max-width: 1120px) {
      width: 100vw;
    }
  ` : `
    background-color: white;
    width: 1120px;
    box-shadow: 0px 0px 24px rgba(19, 19, 19, 0.08);
    border-radius: 16px;
    @media (max-width: 1120px) {
      width: 100vw;
    }
  `}
  height: 80px;
  padding: 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  color: var(--color-text);
`;

const Cover = styled.img`
  width: 54px;
  height: 54px;
  border-radius: 5px;
`;

const CoverWrapper = styled.div`
  position: relative;
  width: 54px;
  height: 54px;
  margin-right: 16px;
  flex-shrink: 0;
  cursor: pointer;

  &:hover .fullscreen-icon {
    opacity: 1;
  }
`;

const FullscreenOverlay = styled.div`
  position: absolute;
  inset: 0;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease;
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
  speakerRef?: RefObject<HTMLButtonElement>;
  onEqualizer: () => void;
  onPlaylist: () => void;
  onSeek: (position: number) => void;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  isPlaying: boolean;
  showQueueButton?: boolean;
  queuePanelOpen?: boolean;
  fullscreenOpen?: boolean;
  onOpenFullscreen?: () => void;
  embedded?: boolean;
  isUploadPlayer?: boolean;
  shuffle?: boolean;
  repeatMode?: RepeatMode;
  onShuffle?: () => void;
  onRepeat?: () => void;
};

function StickyPlayer(props: StickyPlayerProps) {
  const {
    nowPlaying,
    onPlay,
    onPause,
    onPrevious,
    onNext,
    onSpeaker,
    speakerRef,
    onEqualizer,
    onPlaylist,
    onSeek,
    onLike,
    onDislike,
    isPlaying,
    showQueueButton,
    fullscreenOpen,
    onOpenFullscreen,
    embedded,
    isUploadPlayer,
    shuffle,
    repeatMode,
    onShuffle,
    onRepeat,
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
    <Container embedded={embedded}>
      <MiniPlayerWrapper embedded={embedded}>
        <MiniPlayer embedded={embedded} className={embedded ? "" : "!bg-[var(--color-background)]"}>
          {!fullscreenOpen && (
            <CoverWrapper onClick={onOpenFullscreen}>
              {nowPlaying?.albumUri ? (
                <Link to={`/${nowPlaying.albumUri.split("at://")[1].replace("app.rocksky.", "")}`} onClick={(e) => e.stopPropagation()}>
                  {nowPlaying?.albumArt
                    ? <Cover src={nowPlaying.albumArt} key={nowPlaying.albumUri} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : <div className="w-[54px] h-[54px] rounded-[5px] bg-[var(--color-menu-hover)] flex items-center justify-center text-[var(--color-text-muted)]"><IconMusic size={20} /></div>}
                </Link>
              ) : (
                nowPlaying?.albumArt
                  ? <Cover src={nowPlaying.albumArt} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : <div className="w-[54px] h-[54px] rounded-[5px] bg-[var(--color-menu-hover)] flex items-center justify-center text-[var(--color-text-muted)]"><IconMusic size={20} /></div>
              )}
              <FullscreenOverlay className="fullscreen-icon">
                <IconMaximize size={20} color="#fff" />
              </FullscreenOverlay>
            </CoverWrapper>
          )}
          <div className="max-w-[310px] overflow-hidden">
            <div className="max-w-[310px] text-ellipsis overflow-hidden">
              {!!nowPlaying?.songUri && (
                <Link
                  to={`/${nowPlaying?.songUri?.split("at://")[1].replace("app.rocksky.", "")}`}
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
                  to={`/${nowPlaying?.artistUri?.split("at://")[1].replace("app.rocksky.", "")}`}
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
              {!nowPlaying?.liked && <HeartOutline color={embedded ? "#fff" : "var(--color-text)"} />}
            </LikeButton>
          </div>
          <div className="ml-[16px]">
            <div className="h-[45px] min-w-[43px]"></div>
            <LabelSmall style={{ color: embedded ? "rgba(255,255,255,0.8)" : undefined }} className={embedded ? "min-w-[43px]" : "!text-[var(--color-text)] min-w-[43px]"}>
              {formatTime(nowPlaying?.progress || 0)}
            </LabelSmall>
          </div>
          <MainWrapper>
            <Controls>
              {isUploadPlayer && (
                <button
                  onClick={onShuffle}
                  style={{ background: "transparent", border: "none", cursor: "pointer", width: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <IconArrowsShuffle size={16} color={shuffle ? "var(--color-primary)" : (embedded ? "rgba(255,255,255,0.5)" : "var(--color-text-muted)")} />
                </button>
              )}
              <PreviousButton onClick={onPrevious} style={{ backgroundColor: "transparent" }}>
                <Previous color={embedded ? "#fff" : "var(--color-text)"} />
              </PreviousButton>
              {!isPlaying && (
                <PlayButton onClick={onPlay}>
                  <div className="mt-[5px] mr-[3px]">
                    <Play color={embedded ? "#fff" : "var(--color-text)"} small />
                  </div>
                </PlayButton>
              )}
              {isPlaying && (
                <PlayButton onClick={onPause}>
                  <Pause color={embedded ? "#fff" : "var(--color-text)"} small />
                </PlayButton>
              )}
              <NextButton onClick={onNext} style={{ backgroundColor: "transparent" }}>
                <Next color={embedded ? "#fff" : "var(--color-text)"} />
              </NextButton>
              {isUploadPlayer && (
                <button
                  onClick={onRepeat}
                  style={{ background: "transparent", border: "none", cursor: "pointer", width: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {repeatMode === "one"
                    ? <IconRepeatOnce size={16} color="var(--color-primary)" />
                    : <IconRepeat size={16} color={repeatMode === "all" ? "var(--color-primary)" : (embedded ? "rgba(255,255,255,0.5)" : "var(--color-text-muted)")} />
                  }
                </button>
              )}
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
            <LabelSmall style={{ color: embedded ? "rgba(255,255,255,0.8)" : undefined }} className={embedded ? "" : "!text-[var(--color-text)]"}>
              {formatTime(nowPlaying?.duration || 0)}
            </LabelSmall>
          </div>
          <RightActions>
            <Button
              ref={speakerRef}
              onClick={onSpeaker}
              style={{ backgroundColor: "transparent", color: embedded ? "#fff" : "var(--color-text)" }}
            >
              <Speaker />
            </Button>
            <Button onClick={onEqualizer} disabled={!isUploadPlayer} style={{ backgroundColor: "transparent", color: isUploadPlayer ? "var(--color-text)" : undefined }}>
              <Equalizer />
            </Button>
            <Button
              onClick={onPlaylist}
              disabled={!showQueueButton}
              style={{
                backgroundColor: "transparent",
                color: embedded ? "#fff" : "var(--color-text)",
              }}
            >
              <Playlist />
            </Button>
          </RightActions>
        </MiniPlayer>
      </MiniPlayerWrapper>
    </Container>
  );
}

export default StickyPlayer;
