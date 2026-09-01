import styled from "@emotion/styled";
import { IconMusic, IconX } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import type { StickyPlayerProps } from "../StickyPlayer/StrickyPlayer";
import StickyPlayer, { atUriToPath } from "../StickyPlayer/StrickyPlayer";

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
  /* Keep the centered cover + track info clear of the absolutely-positioned
     bottom player bar. */
  padding-bottom: 140px;
  background: linear-gradient(160deg, #130825 0%, #1c0a38 28%, #2d0860 55%, #4800a8 80%, #6200d4 100%);
`;

/* The fullscreen player is always dark (hardcoded white text below), so the
   backdrop pins the dark background colour rather than the theme variable. */
const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  background-color: #130825;
`;

const BackdropArt = styled.div`
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: blur(64px) saturate(140%);
  transform: scale(1.2);
  opacity: 0.35;
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

/**
 * Whether there is an OS window to drag — true only in the desktop shell.
 *
 * Detected inline rather than imported from lib/tauri, which the web build does
 * not have: this component is shared between the two verbatim, and a desktop-only
 * import would break that.
 */
const canDragWindow = () => "__TAURI_INTERNALS__" in window;

/**
 * Somewhere to grab the window while the overlay is up.
 *
 * The app's drag strip (see main.tsx) sits at z-index 1 so toasts and popovers
 * stay above it, which also puts it under this overlay at z-index 100 — so
 * fullscreen left nowhere to drag from. This one lives inside the overlay
 * instead, and stays at z-index 1 so the close button above it keeps its whole
 * hit area rather than losing its top edge to a drag region.
 *
 * Childless on purpose: `data-tauri-drag-region` applies to the element it is
 * on, not to its descendants.
 */
const DragStrip = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 28px;
  z-index: 1;
`;

const BigCover = styled.img`
  position: relative;
  z-index: 1;
  width: min(560px, 65vh);
  height: min(560px, 65vh);
  object-fit: cover;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
`;

const NoCover = styled.div`
  position: relative;
  z-index: 1;
  width: min(560px, 65vh);
  height: min(560px, 65vh);
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const BottomBar = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
`;

type FullscreenPlayerProps = Omit<StickyPlayerProps, "onPlaylist" | "embedded" | "fullscreenOpen" | "onOpenFullscreen" | "onExitFullscreen"> & {
  onClose: () => void;
  onPlaylist: () => void;
};

function FullscreenPlayer({
  nowPlaying,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSpeaker,
  speakerRef,
  onSeek,
  onLike,
  onDislike,
  isPlaying,
  showQueueButton,
  queuePanelOpen,
  onPlaylist,
  onClose,
  isUploadPlayer,
  showVolume,
  showShuffle,
  showRepeat,
  showTrackMenu,
  trackQueued,
  shuffle,
  repeatMode,
  onShuffle,
  onRepeat,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: FullscreenPlayerProps) {
  const navigate = useNavigate();

  if (!nowPlaying) return null;

  const albumPath = atUriToPath(nowPlaying.albumUri);
  // Close the overlay before navigating — it's a fixed, z-index 100 layer
  // that would otherwise cover the album page.
  const openAlbum = albumPath
    ? () => {
        onClose();
        navigate({ to: albumPath });
      }
    : undefined;

  return (
    <Overlay>
      {canDragWindow() && <DragStrip data-tauri-drag-region />}
      {nowPlaying.albumArt && (
        <Backdrop aria-hidden>
          <BackdropArt
            style={{ backgroundImage: `url(${nowPlaying.albumArt})` }}
          />
        </Backdrop>
      )}

      <CloseButton onClick={onClose}>
        <IconX size={28} />
      </CloseButton>

      {nowPlaying.albumArt ? (
        <BigCover
          src={nowPlaying.albumArt}
          onClick={openAlbum}
          style={{ cursor: openAlbum ? "pointer" : undefined }}
        />
      ) : (
        <NoCover>
          <IconMusic size={64} color="rgba(255,255,255,0.4)" />
        </NoCover>
      )}

      <BottomBar>
        <StickyPlayer
          nowPlaying={nowPlaying}
          onPlay={onPlay}
          onPause={onPause}
          onPrevious={onPrevious}
          onNext={onNext}
          onSpeaker={onSpeaker}
          speakerRef={speakerRef}
          onPlaylist={onPlaylist}
          onExitFullscreen={onClose}
          volume={volume}
          muted={muted}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
          onSeek={onSeek}
          isPlaying={isPlaying}
          onLike={onLike}
          onDislike={onDislike}
          showQueueButton={showQueueButton}
          queuePanelOpen={queuePanelOpen}
          isUploadPlayer={isUploadPlayer}
          showVolume={showVolume}
          showShuffle={showShuffle}
          showRepeat={showRepeat}
          showTrackMenu={showTrackMenu}
          trackQueued={trackQueued}
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
