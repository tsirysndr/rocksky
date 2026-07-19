import styled from "@emotion/styled";
import axios from "axios";
import { useAtom, useAtomValue } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import { queueAtom, queueIndexAtom, queuePanelOpenAtom } from "../../atoms/queue";
import { fullscreenPlayerAtom } from "../../atoms/fullscreenPlayer";
import { profileAtom } from "../../atoms/profile";
import { shuffleAtom, repeatModeAtom, type RepeatMode } from "../../atoms/playback";
import { API_URL } from "../../consts";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import StickyPlayer from "./StrickyPlayer";
import FullscreenPlayer from "../FullscreenPlayer/FullscreenPlayer";
import { QueuePanel } from "../QueuePanel/QueuePanel";
import { useQueryClient } from "@tanstack/react-query";
import { feedGeneratorUriAtom } from "../../atoms/feed";
import { InsertMode } from "rockbox-wasm";
import {
  ensureRockboxReady,
  getRockboxPlayer,
  pinQueueIndex,
  publishRepeat,
  publishShuffle,
  registerTracks,
  streamUrlFor,
} from "../../lib/audio/rockbox-engine";
import { ensureStreamToken } from "../../api/uploads";
import { SILENT_AUDIO_DATA_URI } from "../../lib/audio/silence";
import { useRockboxEngine } from "../../hooks/useRockboxEngine";
import { useAudioSettingsPublisher } from "../../hooks/useAudioSettings";
import { useUploadResume } from "../../hooks/useUploadResume";
import { useUploadScrobble } from "../../hooks/useUploadScrobble";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const QueueOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 101;
`;

const PlayerSelectorOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9000;
`;

const PlayerSelectorPopup = styled.div`
  position: fixed;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  z-index: 9001;
  padding: 8px 0;
  min-width: 180px;
  transform: translateX(-50%);
`;

const PlayerSelectorItem = styled.button<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: ${({ active }) => active ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent"};
  color: ${({ active }) => active ? "var(--color-primary)" : "var(--color-text)"};
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  text-align: left;
  &:hover { background: var(--color-menu-hover); }
`;

const PlayerDot = styled.span<{ active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ active }) => active ? "var(--color-primary)" : "var(--color-text-muted)"};
`;

// ---------------------------------------------------------------------------
// StickyPlayerWithData
// ---------------------------------------------------------------------------

function StickyPlayerWithData() {
  useUploadScrobble();
  // Bridge the in-browser rockbox-wasm engine → jotai atoms (track/progress/
  // status/queue events). Replaces the old GraphQL polling entirely.
  useRockboxEngine();
  // Persist the upload queue + position to localStorage and rehydrate it on
  // reload (the engine is reloaded lazily on the next play — see onPlay).
  useUploadResume();
  // Keep the engine's DSP chain (EQ/tone/crossfade/…) in sync with the saved
  // audio settings from app load, so opening Audio Settings applies nothing new.
  useAudioSettingsPublisher();
  const queryClient = useQueryClient();
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const lastFetchedRef = useRef(0);
  const nowPlayingInterval = useRef<number | null>(null);
  const { play, pause, next, previous, seek } = useSpotify();
  const { like, unlike } = useLike();
  const [player, setPlayer] = useAtom(playerAtom);
  const nowPlayingRef = useRef(nowPlaying);
  const playerRef = useRef(player);
  const likedRef = useRef(liked);
  const profile = useAtomValue(profileAtom);
  // Hidden silent <audio> that plays while the wasm engine plays, so the
  // browser surfaces the Media Session / OS media controls (Web Audio alone
  // doesn't trigger them).
  const silentRef = useRef<HTMLAudioElement>(null);

  // The in-browser rockbox queue (mirrored from the wasm engine's events).
  const [queue, setQueue] = useAtom(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const [queuePanelOpen, setQueuePanelOpen] = useAtom(queuePanelOpenAtom);
  const [fullscreenOpen, setFullscreenOpen] = useAtom(fullscreenPlayerAtom);
  const [shuffle, setShuffle] = useAtom(shuffleAtom);
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom);

  // Local volume/mute mirror of the engine's output gain.
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);

  // Player selector
  const [playerSelectorOpen, setPlayerSelectorOpen] = useState(false);
  const speakerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    playerRef.current = player;
    likedRef.current = liked;
  }, [nowPlaying, player, liked]);

  // Publish shuffle/repeat to the engine. No player/ready guard: publish*
  // remembers the value and (re)applies it on the engine's next init, so
  // repeat "all" set before the first play still loops the queue instead of
  // stopping at the end.
  useEffect(() => {
    publishShuffle(shuffle);
  }, [shuffle]);

  useEffect(() => {
    publishRepeat(repeatMode === "one" ? 1 : repeatMode === "all" ? 2 : 0);
  }, [repeatMode]);

  // Progress ticker for Spotify only — rockbox progress comes from the engine's
  // `progress` events, so skip it here to avoid double-counting.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        if (playerRef.current !== "spotify") return prev;
        if (prev.progress >= prev.duration) {
          setTimeout(fetchCurrentlyPlaying, 2000);
          return prev;
        }
        return { ...prev, progress: prev.progress + 100 };
      });
    }, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Spotify polling ───────────────────────────────────────────────────────

  const fetchCurrentlyPlaying = useCallback(async () => {
    const currentPlayer = playerRef.current;
    if (currentPlayer === "rockbox") return;
    const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
      headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (data.item) {
      if (playerRef.current !== null && playerRef.current !== "spotify") return;
      setNowPlaying({
        title: data.item.name,
        artist: data.item.artists[0].name,
        artistUri: data.artistUri,
        songUri: data.songUri,
        albumUri: data.albumUri,
        duration: data.item.duration_ms,
        progress: data.progress_ms,
        albumArt: _.get(data, "item.album.images.0.url"),
        isPlaying: data.is_playing,
        sha256: data.sha256,
        liked: likedRef.current[data.songUri] !== undefined ? likedRef.current[data.songUri] : data.liked,
      });
      setPlayer("spotify");
    } else {
      if (playerRef.current === "spotify") { setNowPlaying(null); setPlayer(null); }
    }
    lastFetchedRef.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNowPlaying]);

  useEffect(() => {
    if (player === "rockbox") return;
    if (nowPlayingInterval.current) clearInterval(nowPlayingInterval.current);
    nowPlayingInterval.current = window.setInterval(() => { fetchCurrentlyPlaying(); }, 15000);
    fetchCurrentlyPlaying();
    return () => { if (nowPlayingInterval.current) clearInterval(nowPlayingInterval.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Playback controls ─────────────────────────────────────────────────────

  const onPlay = async () => {
    if (player === "rockbox") {
      const p = await ensureRockboxReady();
      // Resume after a reload: the queue was rehydrated from localStorage but
      // the engine is empty. Rebuild the engine queue at the saved index and
      // seek to the saved elapsed time once the track is decoded.
      if (p.queue.length === 0 && queue.length > 0) {
        await ensureStreamToken();
        registerTracks(queue);
        const urls = queue.map(streamUrlFor);
        const idx = Math.min(Math.max(0, queueIndex), urls.length - 1);
        const seekMs = nowPlaying?.progress ?? 0;
        p.setQueue([urls[idx]], true);
        const after = urls.slice(idx + 1);
        const before = urls.slice(0, idx);
        if (after.length) p.insert(after, InsertMode.PlayLast);
        if (before.length) p.insert(before, InsertMode.Prepend);
        if (seekMs > 1000) {
          const onceTrack = () => {
            p.off("track", onceTrack);
            try { p.seek(seekMs); } catch { /* not seekable yet */ }
          };
          p.on("track", onceTrack);
        }
        setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : prev);
        return;
      }
      p.play();
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : prev);
      return;
    }
    play();
  };

  const onPause = () => {
    if (player === "rockbox") {
      getRockboxPlayer().pause();
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: false } : prev);
      return;
    }
    pause();
  };

  const onNext = () => {
    if (player === "rockbox") {
      getRockboxPlayer().next();
      return;
    }
    next();
  };

  const onPrevious = () => {
    if (player === "rockbox") {
      getRockboxPlayer().prev();
      return;
    }
    previous();
  };

  const onSeek = (position: number) => {
    if (player === "rockbox") {
      getRockboxPlayer().seek(position);
      setNowPlaying((prev) => prev ? { ...prev, progress: position } : prev);
      return;
    }
    seek(position);
  };

  // ── Volume ────────────────────────────────────────────────────────────────

  const onVolumeChange = (v: number) => {
    setVolumeState(v);
    if (v > 0 && muted) setMutedState(false);
    const p = getRockboxPlayer();
    if (p.ready) p.setVolume(muted ? 0 : v);
  };

  const onToggleMute = () => {
    const nextMuted = !muted;
    setMutedState(nextMuted);
    const p = getRockboxPlayer();
    if (p.ready) p.setVolume(nextMuted ? 0 : volume);
  };

  // ── Like / dislike ────────────────────────────────────────────────────────

  const onLike = async (uri: string) => {
    setLiked({ ...liked, [uri]: true });
    like(uri);
    setNowPlaying((prev) => (prev ? { ...prev, liked: true } : prev));
    await queryClient.invalidateQueries({ queryKey: ["infiniteFeed", feedUri] });
  };

  const onDislike = (uri: string) => {
    setLiked({ ...liked, [uri]: false });
    unlike(uri);
    setNowPlaying((prev) => (prev ? { ...prev, liked: false } : prev));
  };

  // ── Media Session API — lock-screen / OS media controls ───────────────────
  // Mirrors the sticky player: title, artist, album + artwork, live play/pause
  // state, a scrubbable position, and every transport action.

  const album = queue[queueIndex]?.album;

  // Metadata (track identity + artwork).
  useEffect(() => {
    if (!("mediaSession" in navigator) || !nowPlaying) return;
    const art = nowPlaying.albumArt;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      album: album ?? "",
      artwork: art
        ? [
            { src: art, sizes: "96x96" },
            { src: art, sizes: "256x256" },
            { src: art, sizes: "512x512" },
          ]
        : [],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.albumArt, album]);

  // Transport action handlers (re-bound when the active engine changes so the
  // right backend is driven).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    // Drive the silent anchor SYNCHRONOUSLY here (this runs inside the media-key
    // user gesture) so resume works — the deferred sync effect can't call
    // play() in-gesture and would be blocked by the autoplay policy.
    set("play", () => { silentRef.current?.play().catch(() => {}); onPlay(); });
    set("pause", () => { silentRef.current?.pause(); onPause(); });
    set("previoustrack", onPrevious);
    set("nexttrack", onNext);
    try {
      set("seekto", (d) => {
        if (typeof d.seekTime === "number") onSeek(Math.floor(d.seekTime * 1000));
      });
      set("seekbackward", (d) =>
        onSeek(Math.max(0, (nowPlayingRef.current?.progress ?? 0) - (d.seekOffset ?? 10) * 1000)),
      );
      set("seekforward", (d) =>
        onSeek((nowPlayingRef.current?.progress ?? 0) + (d.seekOffset ?? 10) * 1000),
      );
    } catch {
      // older browsers may not support these actions
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Live play/pause state.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = nowPlaying?.isPlaying ? "playing" : "paused";
  }, [nowPlaying?.isPlaying]);

  // Keep the silent Media Session anchor playing whenever the engine plays.
  useEffect(() => {
    const el = silentRef.current;
    if (!el) return;
    if (player === "rockbox" && nowPlaying?.isPlaying) el.play().catch(() => {});
    else el.pause();
  }, [player, nowPlaying?.isPlaying]);

  // Scrubber position (units: mediaSession wants seconds; nowPlaying is ms).
  useEffect(() => {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const dur = nowPlaying?.duration ?? 0;
    const pos = nowPlaying?.progress ?? 0;
    if (dur <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur / 1000,
        position: Math.min(pos, dur) / 1000,
        playbackRate: 1,
      });
    } catch {
      // invalid values (e.g. position > duration mid-transition) — ignore
    }
  }, [nowPlaying?.progress, nowPlaying?.duration]);

  if (!nowPlaying) return <></>;

  const isRockbox = player === "rockbox";

  return (
    <>
      {/* Silent Media Session anchor for the Web Audio (engine) playback path. */}
      <audio ref={silentRef} src={SILENT_AUDIO_DATA_URI} loop preload="auto" />

      {queuePanelOpen && isRockbox && (
        <>
          <QueueOverlay onClick={() => setQueuePanelOpen(false)} />
          <QueuePanel
            queue={queue}
            queueIndex={queueIndex}
            onClose={() => setQueuePanelOpen(false)}
            onPlayIndex={(idx) => {
              const track = queue[idx];
              if (!track) return;
              // Optimistic UI: flip the index + now-playing immediately, and
              // pin the index so a late status from the outgoing track can't
              // revert the "up next" the user just selected.
              pinQueueIndex(idx);
              setQueueIndex(idx);
              setNowPlaying({
                title: track.title,
                artist: track.artist,
                artistUri: "",
                songUri: track.songUri ?? "",
                albumUri: "",
                duration: track.duration,
                progress: 0,
                albumArt: track.albumArt ?? undefined,
                isPlaying: true,
                sha256: track.sha256,
                liked: false,
              });
              getRockboxPlayer().skipTo(idx);
            }}
            onRemove={(idx) => {
              getRockboxPlayer().removeAt(idx);
            }}
            onReorder={(newQueue) => {
              // Optimistic UI only — the wasm engine has no atomic "move", so
              // the next `queue` event will snap back to the engine's order.
              setQueue(newQueue);
            }}
          />
        </>
      )}

      {fullscreenOpen && (
        <FullscreenPlayer
          nowPlaying={nowPlaying}
          onPlay={onPlay}
          onPause={onPause}
          onPrevious={onPrevious}
          onNext={onNext}
          onSeek={onSeek}
          isPlaying={nowPlaying.isPlaying}
          onLike={onLike}
          onDislike={onDislike}
          showQueueButton={isRockbox}
          queuePanelOpen={queuePanelOpen}
          onPlaylist={() => setQueuePanelOpen((o) => !o)}
          onClose={() => setFullscreenOpen(false)}
          isUploadPlayer={isRockbox}
          volume={volume}
          muted={muted}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
          shuffle={shuffle}
          repeatMode={repeatMode}
          onShuffle={() => setShuffle((s) => !s)}
          onRepeat={() => setRepeatMode((r: RepeatMode) => r === "off" ? "all" : r === "all" ? "one" : "off")}
        />
      )}

      {playerSelectorOpen && (() => {
        const rect = speakerRef.current?.getBoundingClientRect();
        const left = rect ? rect.left + rect.width / 2 : 100;
        const bottom = rect ? window.innerHeight - rect.top + 8 : 140;
        return createPortal(
          <>
            <PlayerSelectorOverlay onClick={() => setPlayerSelectorOpen(false)} />
            <PlayerSelectorPopup style={{ left, bottom }}>
              {profile?.spotifyConnected && (
                <PlayerSelectorItem
                  active={player === "spotify"}
                  onClick={() => { setPlayer("spotify"); fetchCurrentlyPlaying(); setPlayerSelectorOpen(false); }}
                >
                  <PlayerDot active={player === "spotify"} />
                  Spotify
                </PlayerSelectorItem>
              )}
              <PlayerSelectorItem
                active={isRockbox}
                onClick={() => {
                  setPlayer("rockbox");
                  setPlayerSelectorOpen(false);
                }}
              >
                <PlayerDot active={isRockbox} />
                Rockbox
              </PlayerSelectorItem>
            </PlayerSelectorPopup>
          </>,
          document.body,
        );
      })()}

      <StickyPlayer
        nowPlaying={nowPlaying}
        onPlay={onPlay}
        onPause={onPause}
        onPrevious={onPrevious}
        onNext={onNext}
        onSpeaker={() => setPlayerSelectorOpen((o) => !o)}
        speakerRef={speakerRef}
        onPlaylist={() => setQueuePanelOpen((o) => !o)}
        onSeek={onSeek}
        isPlaying={nowPlaying.isPlaying}
        onLike={onLike}
        onDislike={onDislike}
        showQueueButton={isRockbox}
        queuePanelOpen={queuePanelOpen}
        fullscreenOpen={fullscreenOpen}
        onOpenFullscreen={() => setFullscreenOpen(true)}
        isUploadPlayer={isRockbox}
        shuffle={shuffle}
        repeatMode={repeatMode}
        onShuffle={() => setShuffle((s) => !s)}
        onRepeat={() => setRepeatMode((r: RepeatMode) => r === "off" ? "all" : r === "all" ? "one" : "off")}
        volume={volume}
        muted={muted}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
      />
    </>
  );
}

export default StickyPlayerWithData;
