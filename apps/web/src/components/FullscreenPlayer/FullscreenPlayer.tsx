import styled from "@emotion/styled";
import { IconMusic, IconX } from "@tabler/icons-react";
import type { StickyPlayerProps } from "../StickyPlayer/StrickyPlayer";
import StickyPlayer from "../StickyPlayer/StrickyPlayer";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  overflow: hidden;
  background: linear-gradient(160deg, #130825 0%, #1c0a38 28%, #2d0860 55%, #4800a8 80%, #6200d4 100%);
`;

const CloseButton = styled.button`
  position: absolute;
  top: 24px;
  right: 24px;
  border: none;
  background: none;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
`;

const BigCover = styled.img`
  width: 420px;
  height: 420px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
`;

const NoCover = styled.div`
  width: 420px;
  height: 420px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const TrackInfo = styled.div`
  text-align: center;
`;

const Title = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
`;

const Artist = styled.div`
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
  font-family: RockfordSansLight;
  font-weight: 600;
`;

const BottomBar = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
`;

type FullscreenPlayerProps = Omit<StickyPlayerProps, "onSpeaker" | "onPlaylist" | "embedded" | "fullscreenOpen" | "onOpenFullscreen"> & {
  onClose: () => void;
  onPlaylist: () => void;
};

function FullscreenPlayer({
  nowPlaying,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSeek,
  onEqualizer,
  onLike,
  onDislike,
  isPlaying,
  showQueueButton,
  queuePanelOpen,
  onPlaylist,
  onClose,
  isUploadPlayer,
  shuffle,
  repeatMode,
  onShuffle,
  onRepeat,
}: FullscreenPlayerProps) {
  if (!nowPlaying) return null;

  return (
    <Overlay>
      <CloseButton onClick={onClose}>
        <IconX size={28} />
      </CloseButton>

      {nowPlaying.albumArt ? (
        <BigCover src={nowPlaying.albumArt} />
      ) : (
        <NoCover>
          <IconMusic size={64} color="rgba(255,255,255,0.4)" />
        </NoCover>
      )}

      <TrackInfo>
        <Title>{nowPlaying.title}</Title>
        <Artist>{nowPlaying.artist}</Artist>
      </TrackInfo>

      <BottomBar>
        <StickyPlayer
          nowPlaying={nowPlaying}
          onPlay={onPlay}
          onPause={onPause}
          onPrevious={onPrevious}
          onNext={onNext}
          onSpeaker={() => {}}
          onEqualizer={onEqualizer ?? (() => {})}
          onPlaylist={onPlaylist}
          onSeek={onSeek}
          isPlaying={isPlaying}
          onLike={onLike}
          onDislike={onDislike}
          showQueueButton={showQueueButton}
          queuePanelOpen={queuePanelOpen}
          isUploadPlayer={isUploadPlayer}
          shuffle={shuffle}
          repeatMode={repeatMode}
          onShuffle={onShuffle}
          onRepeat={onRepeat}
          embedded
          fullscreenOpen
        />
      </BottomBar>
    </Overlay>
  );
}

export default FullscreenPlayer;
