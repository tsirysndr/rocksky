import styled from "@emotion/styled";
import { ProgressBar } from "baseui/progress-bar";
import { LabelSmall } from "baseui/typography";
import { useRef } from "react";
import { Link as DefaultLink } from "react-router-dom";
import { useTimeFormat } from "../../hooks/useFormat";
import Equalizer from "../Icons/Equalizer";
import Next from "../Icons/Next";
import Pause from "../Icons/Pause";
import Play from "../Icons/Play";
import Playlist from "../Icons/Playlist";
import Previous from "../Icons/Previous";
import Speaker from "../Icons/Speaker";
import {
  Button,
  Controls,
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
    duration: number;
    progress: number;
    albumArt?: string;
  } | null;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSpeaker: () => void;
  onEqualizer: () => void;
  onPlaylist: () => void;
  onSeek: (time: number) => void;
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

  return (
    <Container>
      <MiniPlayerWrapper>
        <MiniPlayer>
          <Cover src={nowPlaying?.albumArt} />
          <div>
            <div>
              <Link
                to={`/${nowPlaying?.songUri.split("at://")[1]}`}
                style={{
                  fontWeight: 600,
                }}
              >
                {nowPlaying?.title}
              </Link>
            </div>
            <div>
              <Link
                to={`/${nowPlaying?.artistUri.split("at://")[1]}`}
                style={{
                  fontFamily: "RockfordSansLight",
                  color: "rgba(36, 49, 61, 0.65)",
                  fontWeight: 600,
                }}
              >
                {nowPlaying?.artist}
              </Link>
            </div>
          </div>
          <div style={{ marginLeft: 16 }}>
            <div style={{ height: 45 }}></div>
            <LabelSmall>{formatTime(nowPlaying?.progress || 0)}</LabelSmall>
          </div>
          <MainWrapper>
            <Controls>
              <PreviousButton onClick={onPrevious}>
                <Previous />
              </PreviousButton>
              {!isPlaying && (
                <PlayButton onClick={onPlay}>
                  <Play small />
                </PlayButton>
              )}
              {isPlaying && (
                <PlayButton onClick={onPause}>
                  <Pause small />
                </PlayButton>
              )}
              <NextButton onClick={onNext}>
                <Next />
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
          <div style={{ marginRight: 16 }}>
            <div style={{ height: 45 }}></div>
            <LabelSmall>{formatTime(nowPlaying?.duration || 0)}</LabelSmall>
          </div>
          <RightActions>
            <Button onClick={onSpeaker} disabled>
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
