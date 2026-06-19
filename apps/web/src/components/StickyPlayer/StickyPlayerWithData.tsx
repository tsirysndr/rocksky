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
import { API_URL, ROCKBOX_URL } from "../../consts";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import StickyPlayer from "./StrickyPlayer";
import FullscreenPlayer from "../FullscreenPlayer/FullscreenPlayer";
import { QueuePanel } from "../QueuePanel/QueuePanel";
import { consola } from "consola";
import { useQueryClient } from "@tanstack/react-query";
import { feedGeneratorUriAtom } from "../../atoms/feed";
import { hlsAudio, useHlsAudio } from "../../lib/hls-audio";
import {
  getCurrentTrack,
  getPlaybackStatus,
  getCurrentPlaylist,
  resumePlayback,
  pausePlayback,
  nextTrack,
  previousTrack,
  playlistRemoveTrack,
  seekTo,
} from "../../lib/rockbox-graphql";
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
  const queryClient = useQueryClient();
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const progressInterval = useRef<number | null>(null);
  const lastFetchedRef = useRef(0);
  const nowPlayingInterval = useRef<number | null>(null);
  const { play, pause, next, previous, seek } = useSpotify();
  const { like, unlike } = useLike();
  const [player, setPlayer] = useAtom(playerAtom);
  const nowPlayingRef = useRef(nowPlaying);
  const playerRef = useRef(player);
  const likedRef = useRef(liked);
  const profile = useAtomValue(profileAtom);
  const did = profile?.did ?? "";

  // Rockbox queue (mirrors what rockbox has server-side)
  const [queue, setQueue] = useAtom(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const [queuePanelOpen, setQueuePanelOpen] = useAtom(queuePanelOpenAtom);
  const [fullscreenOpen, setFullscreenOpen] = useAtom(fullscreenPlayerAtom);
  const [shuffle, setShuffle] = useAtom(shuffleAtom);
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom);

  // Player selector
  const [playerSelectorOpen, setPlayerSelectorOpen] = useState(false);
  const speakerRef = useRef<HTMLButtonElement>(null);
  const hlsState = useHlsAudio();

  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  // Suppress pollRockbox's "status === 0 → clear player" path for ~2 s after
  // a user-initiated jump. Rockbox flips status to 0 mid-track-switch; if we
  // catch that, we'd null the player and stop the queue panel from rendering.
  const transitionUntilRef = useRef(0);
  // Pending index from a user click. While set, pollQueue won't accept a
  // playlist.index that disagrees with it — rockbox can briefly report the
  // OLD index after a backward jump (the playlist-pointer update and the
  // codec restart aren't perfectly atomic), which would otherwise revert
  // our optimistic queueIndex and snap Up Next back to the pre-click window.
  const pendingIndexRef = useRef<{ idx: number; until: number } | null>(null);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  // ── Rockbox GraphQL polling ───────────────────────────────────────────────

  const pollRockbox = useCallback(async () => {
    if (!did || playerRef.current === "spotify") return;
    try {
      const [track, status] = await Promise.all([
        getCurrentTrack(did),
        getPlaybackStatus(did),
      ]);

      const isPlaying = status === 1;

      // Only clear when rockbox explicitly reports stopped (status 0).
      // currentTrack can be null for URL-based playback even while playing.
      // Also suppress during a user-initiated jump — rockbox flips status to
      // 0 momentarily while switching tracks, and clearing player would tear
      // down the queue panel + cause pollQueue to stop syncing.
      if (status === 0 && playerRef.current === "rockbox" && Date.now() >= transitionUntilRef.current) {
        setNowPlaying(null);
        setPlayer(null);
        return;
      }

      if (track?.title) {
        // Full metadata update — resync progress from server to prevent drift.
        setNowPlaying((prev) => ({
          title: track.title,
          artist: track.artist ?? "",
          artistUri: "",
          songUri: "",
          albumUri: "",
          duration: track.length,
          // Only snap to server elapsed when it has actually advanced; keep
          // local value otherwise to avoid the progress bar jumping backwards.
          progress: track.elapsed > 0 ? track.elapsed : (prev?.progress ?? 0),
          albumArt: track.albumArt
            ? track.albumArt.startsWith("http")
              ? track.albumArt
              : `${ROCKBOX_URL}/${did}/covers/${track.albumArt}`
            : prev?.albumArt,
          isPlaying,
          sha256: "",
          liked: likedRef.current[track.id] ?? false,
        }));
        if (playerRef.current === null) setPlayer("rockbox");
      } else {
        // currentTrack null but rockbox may still be playing (URL-based tracks
        // don't always populate metadata). Just sync isPlaying.
        setNowPlaying((prev) => prev ? { ...prev, isPlaying } : prev);
        if (playerRef.current === null && isPlaying) setPlayer("rockbox");
      }
    } catch {
      // rockbox server unreachable — don't clear nowPlaying
    }
  }, [did, setNowPlaying, setPlayer]);

  // Poll rockbox queue to keep QueuePanel in sync.
  //
  // `force=true` skips the player-state gate. We use it for refetches
  // triggered by an explicit user action (clicking a queue row, removing a
  // track) — during the brief moment rockbox transitions tracks its status
  // flips to 0, pollRockbox clears `player` to null, and a non-forced
  // pollQueue would bail, leaving the queue mirror stale and Up Next
  // showing the wrong window of tracks.
  const pollQueue = useCallback(
    async (force = false) => {
      if (!did) return;
      if (!force && playerRef.current !== "rockbox") return;
      try {
        const playlist = await getCurrentPlaylist(did);
        if (!playlist) return;

        // Pending-index protection. If the user just jumped to `pending.idx`
        // and rockbox echoes back a DIFFERENT index, that's almost always
        // a stale read (rockbox hasn't fully committed the seek yet). Keep
        // the user's intent and try again on the next tick. If rockbox
        // confirms (or the window elapses), clear pending and accept its
        // value as authoritative again.
        const pending = pendingIndexRef.current;
        const now = Date.now();
        let effectiveIndex = playlist.index;
        if (pending) {
          if (now > pending.until) {
            pendingIndexRef.current = null;
          } else if (playlist.index !== pending.idx) {
            effectiveIndex = pending.idx;
          } else {
            // rockbox caught up — release the pending hold
            pendingIndexRef.current = null;
          }
        }

        setQueueIndex(effectiveIndex);
        setQueue(
          playlist.tracks.map((t) => ({
            uploadId: t.id,
            title: t.title,
            artist: t.artist,
            albumArtist: t.artist,
            album: t.album,
            albumArt: t.albumArt
              ? t.albumArt.startsWith("http")
                ? t.albumArt
                : `${ROCKBOX_URL}/${did}/covers/${t.albumArt}`
              : null,
            duration: t.length,
            sha256: "",
            songUri: t.path,
          })),
        );
      } catch {
        // ignore
      }
    },
    [did, setQueue, setQueueIndex],
  );

  useEffect(() => {
    if (!did) return;
    pollRockbox();
    const interval = window.setInterval(pollRockbox, 2000);
    return () => clearInterval(interval);
  }, [did, pollRockbox]);

  useEffect(() => {
    if (!did) return;
    const interval = window.setInterval(pollQueue, 5000);
    return () => clearInterval(interval);
  }, [did, pollQueue]);

  // Attach HLS stream when player is rockbox
  useEffect(() => {
    if (player !== "rockbox" || !did) {
      hlsAudio.detach();
      return;
    }
    const url = `${ROCKBOX_URL}/${did}/hls/audio.m3u8`;
    hlsAudio.attach(url);
  }, [player, did]);

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

  const startProgressTracking = useCallback(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = window.setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.duration) return prev;
        if (prev.progress >= prev.duration) {
          if (playerRef.current === "spotify") setTimeout(fetchCurrentlyPlaying, 2000);
          return prev;
        }
        if (prev.isPlaying) return { ...prev, progress: prev.progress + 100 };
        return prev;
      });
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCurrentlyPlaying, setNowPlaying]);

  useEffect(() => {
    startProgressTracking();
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    playerRef.current = player;
    likedRef.current = liked;
  }, [nowPlaying, player, liked]);

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
      if (!hlsState.attached && did) {
        hlsAudio.attach(`${ROCKBOX_URL}/${did}/hls/audio.m3u8`);
      }
      hlsAudio.resume();
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : prev);
      await resumePlayback(did).catch(console.warn);
      return;
    }
    play();
  };

  const onPause = () => {
    if (player === "rockbox") {
      hlsAudio.pause();
      setNowPlaying((prev) => prev ? { ...prev, isPlaying: false } : prev);
      pausePlayback(did).catch(console.warn);
      return;
    }
    pause();
  };

  const onNext = () => {
    if (player === "rockbox") {
      nextTrack(did).catch(console.warn);
      return;
    }
    next();
  };

  const onPrevious = () => {
    if (player === "rockbox") {
      previousTrack(did).catch(console.warn);
      return;
    }
    previous();
  };

  const onSeek = (position: number) => {
    if (player === "rockbox") {
      seekTo(did, position).catch(console.warn);
      setNowPlaying((prev) => prev ? { ...prev, progress: position } : prev);
      return;
    }
    seek(position);
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

  // ── Media Session API ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!("mediaSession" in navigator) || !nowPlaying) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      artwork: nowPlaying.albumArt ? [{ src: nowPlaying.albumArt, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", onPlay);
    navigator.mediaSession.setActionHandler("pause", onPause);
    navigator.mediaSession.setActionHandler("previoustrack", onPrevious);
    navigator.mediaSession.setActionHandler("nexttrack", onNext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.albumArt]);

  if (!nowPlaying) return <></>;

  const isRockbox = player === "rockbox";

  return (
    <>
      {queuePanelOpen && isRockbox && (
        <>
          <QueueOverlay onClick={() => setQueuePanelOpen(false)} />
          <QueuePanel
            queue={queue}
            queueIndex={queueIndex}
            onClose={() => setQueuePanelOpen(false)}
            onPlayIndex={(idx) => {
              const track = queue[idx];
              if (!track || !did) return;
              // Suppress pollRockbox's status=0 → clear-player path for the
              // next 2 seconds. Rockbox stops the codec mid-jump and the
              // transient status=0 would otherwise nuke `player`, hiding
              // the queue panel and stopping pollQueue.
              transitionUntilRef.current = Date.now() + 2000;
              // Pin our intent for 3 s. pollQueue will keep displaying `idx`
              // even if rockbox briefly echoes the OLD index — common for
              // backward jumps where the playlist-pointer update and the
              // codec restart race. Released early once rockbox confirms.
              pendingIndexRef.current = { idx, until: Date.now() + 3000 };
              // Optimistic UI: jump the index NOW so up-next/history flip
              // immediately. Then call rockbox, then refetch — twice. The
              // first refetch handles the common case (rockbox sets
              // playlist->index synchronously). The 500 ms second refetch is
              // belt-and-suspenders for backward jumps where rockbox needs
              // to spin up a fresh HTTP fetch for the older track before
              // get_current_track returns the right metadata.
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
              import("../../lib/rockbox-graphql").then(({ startPlaylist }) =>
                startPlaylist(did, idx)
                  .then(() => pollQueue(true))
                  .then(() =>
                    new Promise((r) => setTimeout(r, 500)).then(() => pollQueue(true)),
                  )
                  .catch((e) => consola.warn("startPlaylist failed", e)),
              );
            }}
            onRemove={(idx) => {
              if (!did) return;
              // Call rockbox to actually drop the track; force the refetch
              // because removing the currently-playing track can flip the
              // player status to 0 briefly.
              playlistRemoveTrack(did, idx)
                .then(() => pollQueue(true))
                .catch((e) => consola.warn("playlistRemoveTrack failed", e));
            }}
            onReorder={(newQueue) => {
              // Reorder is a UI-only optimistic update for now — rockbox has
              // no "move track" mutation, only insert/remove. A proper
              // implementation would remove + re-insert at the new position;
              // until then, the next pollQueue tick will snap back to
              // rockbox's order.
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
          volume={hlsState.volume}
          muted={hlsState.muted}
          onVolumeChange={(v) => hlsAudio.setVolume(v)}
          onToggleMute={() => hlsAudio.toggleMute()}
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
              {did && (
                <PlayerSelectorItem
                  active={isRockbox}
                  onClick={() => {
                    const url = `${ROCKBOX_URL}/${did}/hls/audio.m3u8`;
                    hlsAudio.attach(url);
                    setPlayer("rockbox");
                    setPlayerSelectorOpen(false);
                  }}
                >
                  <PlayerDot active={isRockbox} />
                  Rockbox
                </PlayerSelectorItem>
              )}
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
        volume={hlsState.volume}
        muted={hlsState.muted}
        onVolumeChange={(v) => hlsAudio.setVolume(v)}
        onToggleMute={() => hlsAudio.toggleMute()}
      />
    </>
  );
}

export default StickyPlayerWithData;
