import styled from "@emotion/styled";
import { Link as DefaultLink, useNavigate } from "@tanstack/react-router";
import { IconAdjustmentsHorizontal, IconArrowsShuffle, IconDisc, IconDots, IconMaximize, IconMusic, IconRepeat, IconRepeatOnce, IconVolume2, IconVolumeOff } from "@tabler/icons-react";
import type { RepeatMode } from "../../atoms/playback";
import { ProgressBar } from "baseui/progress-bar";
import { LabelSmall } from "baseui/typography";
import { useRef, useState, type RefObject } from "react";
import { NowPlayingMenu } from "../NowPlayingMenu";
import ScrollingText from "../ScrollingText/ScrollingText";
import { useTimeFormat } from "../../hooks/useFormat";
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
  LeftSection,
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
    /* Frosted glass over the fullscreen backdrop: mostly transparent so the
       blurred album art clearly shows through. The fullscreen player is
       ALWAYS dark, so pin a dark glass tint — never the theme background
       variable, which is white in light theme. */
    background: rgba(19, 8, 37, 0.45);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    width: 1120px;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    @media (max-width: 1120px) {
      width: 100vw;
    }
  ` : `
    /* Frosted-glass panel: a translucent tint of the theme background with a
       blur of the content behind it (works in both light and dark). */
    background: color-mix(in srgb, var(--color-background) 80%, transparent);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid color-mix(in srgb, var(--color-text-muted) 16%, transparent);
    width: 1120px;
    box-shadow: 0px 8px 32px rgba(19, 19, 19, 0.14);
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
  color: ${({ embedded }) => (embedded ? "#fff" : "var(--color-text)")};
`;

const Cover = styled.img`
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 5px;
`;

const CoverWrapper = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
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

// Neon chips for the probed audio format (e.g. MP3) and sample rate (e.g.
// 44.1kHz). Fixed neon colors on purpose — they read as "signal lights" in
// both themes and match the always-dark fullscreen bar.
const NeonBadge = styled.span<{ neon: string }>`
  /* inline-flex + centering + a shared min-width so both chips (e.g. "MP3"
     and "44.1kHz") render as uniform, center-aligned badges. No
     letter-spacing: it adds trailing space after the last glyph, which
     skews the text off-center inside the chip. */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  box-sizing: border-box;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  white-space: nowrap;
  color: ${({ neon }) => neon};
  border: 1px solid ${({ neon }) => neon};
  text-shadow: 0 0 6px ${({ neon }) => neon};
  box-shadow:
    0 0 6px -2px ${({ neon }) => neon},
    inset 0 0 6px -4px ${({ neon }) => neon};
`;

const Badges = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  /* 8px + the icon buttons' ~7px internal inset ≈ the same visual gap as
     between two adjacent icon buttons, so the whole right cluster
     (badges · device · EQ · queue) reads as evenly spaced. */
  margin-right: 8px;
`;

// "MPEG 1 Layer 3" / "mp3" → "MP3", "FLAC" stays "FLAC", unknown strings are
// just uppercased (trimmed so an exotic codec name can't blow up the badge).
function formatCodec(codec?: string): string | null {
  if (!codec) return null;
  const c = codec.toLowerCase();
  const map: [string, string][] = [
    ["layer 3", "MP3"],
    ["mp3", "MP3"],
    ["flac", "FLAC"],
    ["alac", "ALAC"],
    ["aac", "AAC"],
    ["m4a", "AAC"],
    ["opus", "OPUS"],
    ["vorbis", "OGG"],
    ["ogg", "OGG"],
    ["wave", "WAV"],
    ["wav", "WAV"],
    ["pcm", "WAV"],
    ["aiff", "AIFF"],
  ];
  for (const [needle, label] of map) if (c.includes(needle)) return label;
  return codec.toUpperCase().slice(0, 8);
}

// 44100 → "44.1kHz", 48000 → "48kHz", 96000 → "96kHz".
function formatSampleRate(hz?: number): string | null {
  if (!hz || hz <= 0) return null;
  const khz = hz / 1000;
  const label = Number.isInteger(khz) ? `${khz}` : khz.toFixed(1);
  return `${label}kHz`;
}

// Build a router path from an atproto URI like
//   at://did:plc:xxx/app.rocksky.song/abc
// Returns null when `uri` is missing OR isn't an at:// URI (e.g. an HTTPS
// stream URL coming from a rockbox playlist track — those have no in-app
// route to link to, and the old code crashed trying to .split("at://")[1]
// + .replace(...) on `undefined`).
export function atUriToPath(uri: string | undefined): string | null {
  if (!uri) return null;
  const rest = uri.split("at://")[1];
  if (!rest) return null;
  return `/${rest.replace("app.rocksky.", "")}`;
}

export type StickyPlayerProps = {
  nowPlaying?: {
    title: string;
    artist: string;
    artistUri: string;
    songUri: string;
    albumUri: string;
    album?: string;
    duration: number;
    progress: number;
    albumArt?: string;
    liked: boolean;
    sha256: string;
    codec?: string;
    sampleRate?: number;
  } | null;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSpeaker: () => void;
  speakerRef?: RefObject<HTMLButtonElement>;
  onPlaylist: () => void;
  volume?: number;
  muted?: boolean;
  onVolumeChange?: (v: number) => void;
  onToggleMute?: () => void;
  onSeek: (position: number) => void;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  isPlaying: boolean;
  showQueueButton?: boolean;
  queuePanelOpen?: boolean;
  fullscreenOpen?: boolean;
  onOpenFullscreen?: () => void;
  onExitFullscreen?: () => void;
  embedded?: boolean;
  isUploadPlayer?: boolean;
  /** Show the "…" track menu beside the heart. Off for Spotify, whose queue
   *  and library actions this app does not own. */
  showTrackMenu?: boolean;
  /** Library id of the playing track, when it has one — enables Add to playlist. */
  trackUploadId?: string;
  shuffle?: boolean;
  repeatMode?: RepeatMode;
  onShuffle?: () => void;
  onRepeat?: () => void;
};

function StickyPlayer(props: StickyPlayerProps) {
  const navigate = useNavigate();
  // Anchor for the "…" track menu; null when it is closed.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const {
    nowPlaying,
    onPlay,
    onPause,
    onPrevious,
    onNext,
    onSpeaker,
    speakerRef,
    onPlaylist,
    volume = 1,
    muted = false,
    onVolumeChange,
    onToggleMute,
    onSeek,
    onLike,
    onDislike,
    showTrackMenu,
    trackUploadId,
    isPlaying,
    showQueueButton,
    fullscreenOpen,
    onOpenFullscreen,
    onExitFullscreen,
    embedded,
    isUploadPlayer,
    shuffle,
    repeatMode,
    onShuffle,
    onRepeat,
  } = props;
  const progressbarRef = useRef<HTMLDivElement>(null);
  const { formatTime } = useTimeFormat();

  // In the fullscreen player the overlay sits above the whole app, so a
  // title/artist/album link would navigate invisibly underneath it. Close the
  // overlay on click and let the Link perform the navigation.
  const exitFullscreenOnNavigate = fullscreenOpen
    ? () => onExitFullscreen?.()
    : undefined;

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
        <MiniPlayer embedded={embedded}>
          <LeftSection>
          {!fullscreenOpen && (
            <CoverWrapper onClick={onOpenFullscreen}>
              {(() => {
                const albumPath = atUriToPath(nowPlaying?.albumUri);
                const fallback = nowPlaying?.albumArt
                  ? <Cover src={nowPlaying.albumArt} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  : <div className="w-[64px] h-[64px] rounded-[5px] bg-[var(--color-menu-hover)] flex items-center justify-center text-[var(--color-text-muted)]"><IconMusic size={20} /></div>;
                return albumPath ? (
                  <Link to={albumPath} onClick={(e) => e.stopPropagation()}>
                    {nowPlaying?.albumArt
                      ? <Cover src={nowPlaying.albumArt} key={nowPlaying.albumUri} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      : <div className="w-[64px] h-[64px] rounded-[5px] bg-[var(--color-menu-hover)] flex items-center justify-center text-[var(--color-text-muted)]"><IconMusic size={20} /></div>}
                  </Link>
                ) : fallback;
              })()}
              <FullscreenOverlay className="fullscreen-icon">
                <IconMaximize size={20} color="#fff" />
              </FullscreenOverlay>
            </CoverWrapper>
          )}
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Title row: marquee + heart, so the like button sits exactly on
                the title line instead of floating mid-bar. */}
            <div className="flex flex-row items-center">
              <div className="flex-1 min-w-0 overflow-hidden">
                <ScrollingText key={`title-${nowPlaying?.songUri}`}>
                  {(() => {
                    const songPath = atUriToPath(nowPlaying?.songUri);
                    return songPath ? (
                      <Link
                        to={songPath}
                        style={{ fontWeight: 600 }}
                        onClick={exitFullscreenOnNavigate}
                      >
                        {nowPlaying?.title}
                      </Link>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{nowPlaying?.title}</span>
                    );
                  })()}
                </ScrollingText>
              </div>
              <div className="ml-[8px] flex-shrink-0 flex items-center">
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
                {showTrackMenu && nowPlaying && (
                  <LikeButton
                    aria-label="Track options"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuAnchor(menuAnchor ? null : e.currentTarget);
                    }}
                  >
                    <IconDots
                      size={18}
                      color={embedded ? "#fff" : "var(--color-text)"}
                    />
                  </LikeButton>
                )}
                {menuAnchor && nowPlaying && (
                  <NowPlayingMenu
                    track={nowPlaying}
                    uploadId={trackUploadId}
                    anchorEl={menuAnchor}
                    onClose={() => setMenuAnchor(null)}
                  />
                )}
              </div>
            </div>
            <ScrollingText key={`artist-${nowPlaying?.artistUri}`}>
              {(() => {
                const artistPath = atUriToPath(nowPlaying?.artistUri);
                return artistPath ? (
                  <Link
                    to={artistPath}
                    style={{
                      fontFamily: "RockfordSansLight",
                      fontWeight: 600,
                    }}
                    className={embedded ? "!text-[rgba(255,255,255,0.7)]" : "!text-[var(--color-text-muted)]"}
                    onClick={exitFullscreenOnNavigate}
                  >
                    {nowPlaying?.artist}
                  </Link>
                ) : (
                  <span
                    style={{
                      fontFamily: "RockfordSansLight",
                      fontWeight: 600,
                    }}
                    className={embedded ? "text-[rgba(255,255,255,0.7)]" : "text-[var(--color-text-muted)]"}
                  >
                    {nowPlaying?.artist}
                  </span>
                );
              })()}
            </ScrollingText>
            {nowPlaying?.album && (
              <ScrollingText key={`album-${nowPlaying?.albumUri || nowPlaying?.album}`}>
                {(() => {
                  const albumPath = atUriToPath(nowPlaying?.albumUri);
                  const linkClass = embedded
                    ? "!text-[rgba(255,255,255,0.55)]"
                    : "!text-[var(--color-text-muted)]";
                  const mutedClass = embedded
                    ? "text-[rgba(255,255,255,0.55)]"
                    : "text-[var(--color-text-muted)]";
                  const inner = (
                    <span
                      className="inline-flex items-center gap-[4px] text-[12px]"
                      style={{ fontFamily: "RockfordSansLight", fontWeight: 600 }}
                    >
                      <IconDisc size={13} className="shrink-0" />
                      {nowPlaying?.album}
                    </span>
                  );
                  return albumPath ? (
                    <Link
                      to={albumPath}
                      className={linkClass}
                      onClick={exitFullscreenOnNavigate}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <span className={mutedClass}>{inner}</span>
                  );
                })()}
              </ScrollingText>
            )}
          </div>
          </LeftSection>
          <div className="ml-[16px]">
            <div className="h-[45px] min-w-[43px]"></div>
            <LabelSmall style={{ color: embedded ? "rgba(255,255,255,0.8)" : undefined, fontFamily: "var(--font-mono)" }} className={embedded ? "min-w-[43px]" : "!text-[var(--color-text)] min-w-[43px]"}>
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
                <PlayButton onClick={onPlay} style={embedded ? { backgroundColor: "rgba(255,255,255,0.15)" } : undefined}>
                  <div className="mt-[5px] mr-[3px]">
                    <Play color={embedded ? "#fff" : "var(--color-text)"} small />
                  </div>
                </PlayButton>
              )}
              {isPlaying && (
                <PlayButton onClick={onPause} style={embedded ? { backgroundColor: "rgba(255,255,255,0.15)" } : undefined}>
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
            <LabelSmall style={{ color: embedded ? "rgba(255,255,255,0.8)" : undefined, fontFamily: "var(--font-mono)" }} className={embedded ? "" : "!text-[var(--color-text)]"}>
              {formatTime(nowPlaying?.duration || 0)}
            </LabelSmall>
          </div>
          <RightActions>
            {(() => {
              const codecLabel = formatCodec(nowPlaying?.codec);
              const rateLabel = formatSampleRate(nowPlaying?.sampleRate);
              if (!codecLabel && !rateLabel) return null;
              return (
                <Badges>
                  {codecLabel && <NeonBadge neon="#00f1f3">{codecLabel}</NeonBadge>}
                  {rateLabel && <NeonBadge neon="#ff2876">{rateLabel}</NeonBadge>}
                </Badges>
              );
            })()}
            <Button
              ref={speakerRef}
              onClick={onSpeaker}
              style={{ backgroundColor: "transparent", color: embedded ? "#fff" : "var(--color-text)" }}
            >
              <Speaker />
            </Button>
            {isUploadPlayer && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={onToggleMute}
                  style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 4 }}
                  title={muted ? "Unmute" : "Mute"}
                >
                  {muted
                    ? <IconVolumeOff size={18} color={embedded ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)"} />
                    : <IconVolume2 size={18} color={embedded ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)"} />
                  }
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => onVolumeChange?.(parseFloat(e.target.value))}
                  style={{ width: 72, accentColor: embedded ? "#fff" : "var(--color-primary)", cursor: "pointer" }}
                />
              </div>
            )}
            <Button
              onClick={() => {
                // In the fullscreen player, close the overlay first or the
                // settings page opens hidden underneath it.
                onExitFullscreen?.();
                navigate({ to: "/settings/audio" });
              }}
              disabled={!showQueueButton || fullscreenOpen}
              title="Audio settings"
              aria-label="Audio settings"
              style={{
                backgroundColor: "transparent",
                color: embedded ? "#fff" : "var(--color-text)",
                padding: 0,
              }}
            >
              <IconAdjustmentsHorizontal
                size={20}
                color={embedded ? "#fff" : "var(--color-text)"}
              />
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
