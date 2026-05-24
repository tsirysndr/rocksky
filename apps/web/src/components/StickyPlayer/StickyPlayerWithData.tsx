import styled from "@emotion/styled";
import axios from "axios";
import { useAtom, useAtomValue } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Rockbox WASM singleton (one instance per page lifetime)
// ---------------------------------------------------------------------------
let _rbPlayer: any = null;
let _rbInitPromise: Promise<any> | null = null;

// WASM assets live in public/ and are served from the same origin in all environments.
const ROCKBOX_BASE = "";

async function getRockboxPlayer(): Promise<any> {
  if (_rbPlayer) return _rbPlayer;
  if (_rbInitPromise) return _rbInitPromise;
  _rbInitPromise = (async () => {
    const { RockboxPlayer } = await import(/* @vite-ignore */ `${ROCKBOX_BASE}/rockbox.js`);
    const p = new RockboxPlayer({
      wasmUrl: `${ROCKBOX_BASE}/rockboxd.js`,
      workletUrl: `${ROCKBOX_BASE}/rockbox-audio-worklet.js`,
    });
    await p.init("/config", "/music");
    _rbPlayer = p;
    return p;
  })();
  return _rbInitPromise;
}

/**
 * True when the page is cross-origin isolated (COOP + COEP headers present).
 * SharedArrayBuffer (required by Rockbox WASM pthreads) is only available in
 * cross-origin isolated contexts.  In local dev without those headers we fall
 * back to a plain HTML5 <audio> element.
 */
const ROCKBOX_ENABLED = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
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
import { consola } from "consola";
import { useQueryClient } from "@tanstack/react-query";
import { feedGeneratorUriAtom } from "../../atoms/feed";
import { getStreamUrl, ensureStreamToken } from "../../api/uploads";
import { useQueuePersistence } from "../../hooks/useQueuePersistence";
import { useUploadScrobble } from "../../hooks/useUploadScrobble";

// ---------------------------------------------------------------------------
// Queue Panel
// ---------------------------------------------------------------------------

const QueueOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 101;
`;

const PlayerSelectorOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 200;
`;

const PlayerSelectorPopup = styled.div`
  position: fixed;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  z-index: 201;
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
  useQueuePersistence();
  useUploadScrobble();
  const queryClient = useQueryClient();
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const progressInterval = useRef<number | null>(null);
  const lastFetchedRef = useRef(0);
  const nowPlayingInterval = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatInterval = useRef<number | null>(null);
  const { play, pause, next, previous, seek } = useSpotify();
  const { like, unlike } = useLike();
  const [player, setPlayer] = useAtom(playerAtom);
  const nowPlayingRef = useRef(nowPlaying);
  const playerRef = useRef(player);
  const likedRef = useRef(liked);
  const profile = useAtomValue(profileAtom);

  // Upload player state
  const [queue, setQueue] = useAtom(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const [queuePanelOpen, setQueuePanelOpen] = useAtom(queuePanelOpenAtom);
  const [fullscreenOpen, setFullscreenOpen] = useAtom(fullscreenPlayerAtom);
  const [shuffle, setShuffle] = useAtom(shuffleAtom);
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom);
  const shuffleRef = useRef(shuffle);
  const repeatModeRef = useRef(repeatMode);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  // Player selector
  const [playerSelectorOpen, setPlayerSelectorOpen] = useState(false);
  const [rockboxAvailable, setRockboxAvailable] = useState(false);
  const speakerRef = useRef<HTMLButtonElement>(null);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);

  // Rockbox WASM refs
  const rbPlayerRef = useRef<any>(null);
  const rbNextOurIdxRef = useRef(-1);    // Our queue idx of the preloaded next track
  const rbLastPlaylistIdxRef = useRef(-1); // Last Rockbox playlist index we processed
  const rbAdvancedRef = useRef(false);   // True when Rockbox auto-advanced (skip re-play)
  const rbListenersSetRef = useRef(false); // Event listeners registered flag

  // HTML5 audio fallback (used when page is not cross-origin isolated)
  const audioRef = useRef<HTMLAudioElement>(null);

  // Prevent autoplay on initial page load (queue restored from storage)
  const hasMountedRef = useRef(false);
  // Incrementing this forces the play effect to re-run (used by onPlay first-play)
  const [playTrigger, setPlayTrigger] = useState(0);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  // Stop upload audio when switching to another player
  useEffect(() => {
    if (player === "upload") return;
    if (ROCKBOX_ENABLED) {
      const p = rbPlayerRef.current;
      if (p) p.stop();
    } else {
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ""; }
    }
  }, [player]);

  // Rockbox: sync repeat mode when it changes during playback (WASM path only)
  useEffect(() => {
    if (!ROCKBOX_ENABLED || player !== "upload") return;
    const p = rbPlayerRef.current;
    if (!p) return;
    // repeat=one handled natively (mode 2), all/off handled via JS enqueue logic (mode 0)
    p.setRepeat(repeatMode === "one" ? 2 : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatMode]);

  // HTML5 audio event listeners (fallback when crossOriginIsolated is false)
  useEffect(() => {
    if (player !== "upload" || ROCKBOX_ENABLED) return;
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setNowPlaying((prev) => prev ? { ...prev, progress: Math.floor(audio.currentTime * 1000) } : prev);
    const onPlay = () => setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : prev);
    const onPause = () => setNowPlaying((prev) => prev ? { ...prev, isPlaying: false } : prev);
    const onEnded = () => {
      const q = queueRef.current;
      const cur = queueIndexRef.current;
      if (repeatModeRef.current === "one") {
        audio.currentTime = 0; audio.play().catch(() => {});
        setNowPlaying((prev) => prev ? { ...prev, progress: 0, isPlaying: true } : prev);
        return;
      }
      let nextIdx: number;
      if (shuffleRef.current && q.length > 1) {
        do { nextIdx = Math.floor(Math.random() * q.length); } while (nextIdx === cur);
      } else { nextIdx = cur + 1; }
      const nextTrack = q[nextIdx] ?? (repeatModeRef.current === "all" ? q[0] : null);
      const resolvedIdx = q[nextIdx] ? nextIdx : (repeatModeRef.current === "all" ? 0 : -1);
      if (nextTrack && resolvedIdx >= 0) {
        setQueueIndex(resolvedIdx);
        setNowPlaying({ title: nextTrack.title, artist: nextTrack.artist, artistUri: "", songUri: nextTrack.songUri ?? "", albumUri: "", duration: nextTrack.duration, progress: 0, albumArt: nextTrack.albumArt ?? undefined, isPlaying: true, sha256: nextTrack.sha256, liked: false });
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Load and play current track (user-initiated navigation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (player !== "upload") return;
    const track = queue[queueIndex];
    if (!track) return;

    // On initial page load (atoms restored from storage), show track info without playing.
    // hasMountedRef becomes true only after this effect has run once (see effect above).
    if (!hasMountedRef.current) {
      setNowPlaying({ title: track.title, artist: track.artist, artistUri: "", songUri: track.songUri ?? "", albumUri: "", duration: track.duration, progress: 0, albumArt: track.albumArt ?? undefined, isPlaying: false, sha256: track.sha256, liked: false });
      return;
    }

    // HTML5 fallback path (page not cross-origin isolated)
    if (!ROCKBOX_ENABLED) {
      consola.info("[upload] HTML5 audio fallback — page not cross-origin isolated");
      if (rbAdvancedRef.current) { rbAdvancedRef.current = false; return; }
      let cancelled = false;
      ensureStreamToken().then(() => {
        if (cancelled) return;
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = getStreamUrl(track.uploadId);
        audio.play().catch(() => {});
        setNowPlaying({ title: track.title, artist: track.artist, artistUri: "", songUri: track.songUri ?? "", albumUri: "", duration: track.duration, progress: 0, albumArt: track.albumArt ?? undefined, isPlaying: true, sha256: track.sha256, liked: false });
      });
      return () => { cancelled = true; };
    }

    // Rockbox already auto-advanced to this track — just clear the flag, don't re-play
    if (rbAdvancedRef.current) {
      rbAdvancedRef.current = false;
      return;
    }

    let cancelled = false;

    const run = async () => {
      await ensureStreamToken();
      const p = await getRockboxPlayer();
      if (cancelled) return;
      rbPlayerRef.current = p;

      // Register Rockbox event listeners exactly once per player instance
      if (!rbListenersSetRef.current) {
        rbListenersSetRef.current = true;

        // Progress ticks (every ~200 ms) — update elapsed / isPlaying
        p.on("progress", ({ elapsed_ms, duration_ms, status }: { elapsed_ms: number; duration_ms: number; status: number }) => {
          if (playerRef.current !== "upload") return;
          if (status === 0) return; // stopped — don't overwrite with zeros
          setNowPlaying((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              progress: elapsed_ms,
              duration: duration_ms > 0 ? duration_ms : prev.duration,
              isPlaying: status === 1,
            };
          });
        });

        // Status changes — paused state
        p.on("status", ({ status }: { status: number }) => {
          if (playerRef.current !== "upload") return;
          if (status === 2) {
            setNowPlaying((prev) => (prev ? { ...prev, isPlaying: false } : prev));
          }
        });

        // Playlist index changed — Rockbox auto-advanced to the preloaded next track
        p.on("playlist", ({ index }: { index: number }) => {
          if (playerRef.current !== "upload") return;
          if (index <= rbLastPlaylistIdxRef.current) return;
          rbLastPlaylistIdxRef.current = index;

          const nextOurIdx = rbNextOurIdxRef.current;
          if (nextOurIdx < 0) return;

          // Mark as Rockbox-initiated so the effect doesn't re-call playUrl()
          rbAdvancedRef.current = true;
          setQueueIndex(nextOurIdx);

          const advancedTrack = queueRef.current[nextOurIdx];
          if (advancedTrack) {
            setNowPlaying({
              title: advancedTrack.title,
              artist: advancedTrack.artist,
              artistUri: "",
              songUri: advancedTrack.songUri ?? "",
              albumUri: "",
              duration: advancedTrack.duration,
              progress: 0,
              albumArt: advancedTrack.albumArt ?? undefined,
              isPlaying: true,
              sha256: advancedTrack.sha256,
              liked: false,
            });
          }

          // Compute and enqueue the next lookahead
          const q = queueRef.current;
          const cur = nextOurIdx;
          const repeat = repeatModeRef.current;
          const shuffle = shuffleRef.current;
          let newNextIdx: number;
          if (repeat === "one") {
            newNextIdx = cur;
          } else if (shuffle && q.length > 1) {
            do { newNextIdx = Math.floor(Math.random() * q.length); } while (newNextIdx === cur);
          } else {
            newNextIdx = cur + 1;
            if (newNextIdx >= q.length) newNextIdx = repeat === "all" ? 0 : -1;
          }
          rbNextOurIdxRef.current = newNextIdx;
          if (newNextIdx >= 0) {
            const lookaheadTrack = q[newNextIdx];
            if (lookaheadTrack && playerRef.current === "upload") {
              p.enqueueUrl(getStreamUrl(lookaheadTrack.uploadId));
            }
          }
        });
      }

      // Apply repeat mode (repeat-one = Rockbox mode 2, everything else = 0)
      p.setRepeat(repeatModeRef.current === "one" ? 2 : 0);

      // Reset Rockbox playlist tracking index for the fresh playUrl() call
      rbLastPlaylistIdxRef.current = -1;

      if (cancelled) return;
      p.playUrl(getStreamUrl(track.uploadId));
      p.resumeAudio().catch(() => {});

      // Update nowPlaying immediately so the UI reflects the new track
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

      // Preload the next track for gapless transition
      const q = queue;
      const cur = queueIndex;
      const repeat = repeatModeRef.current;
      const shuffle = shuffleRef.current;
      let nextIdx: number;
      if (repeat === "one") {
        nextIdx = cur;
      } else if (shuffle && q.length > 1) {
        do { nextIdx = Math.floor(Math.random() * q.length); } while (nextIdx === cur);
      } else {
        nextIdx = cur + 1;
        if (nextIdx >= q.length) nextIdx = repeat === "all" ? 0 : -1;
      }
      rbNextOurIdxRef.current = nextIdx;
      if (nextIdx >= 0) {
        const nextTrack = q[nextIdx];
        if (nextTrack && !cancelled && playerRef.current === "upload") {
          p.enqueueUrl(getStreamUrl(nextTrack.uploadId));
        }
      }
    };

    run().catch(console.error);
    return () => { cancelled = true; };
  }, [player, queueIndex, playTrigger]); // playTrigger lets onPlay force a load+play on first click

  // Mark mount complete — MUST be declared after the play effect so it runs after on initial mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { hasMountedRef.current = true; }, []);

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

  const onPlay = () => {
    if (player === "upload") {
      if (ROCKBOX_ENABLED) {
        const p = rbPlayerRef.current;
        if (p) {
          p.resumeAudio().catch(() => {}); p.play();
        } else {
          // First play after page load — trigger the play effect to init + load + play
          hasMountedRef.current = true;
          setPlayTrigger((t) => t + 1);
        }
      } else {
        const audio = audioRef.current;
        if (!audio) return;
        if (!audio.src) {
          // First play after page load — load URL then play
          const track = queueRef.current[queueIndexRef.current];
          if (!track) return;
          audio.src = getStreamUrl(track.uploadId);
          audio.play().catch(() => {});
        } else {
          audio.play().catch(() => {});
        }
      }
      return;
    }
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "command", action: "play", token: localStorage.getItem("token") }));
      return;
    }
    play();
  };

  const onPause = () => {
    if (player === "upload") {
      if (ROCKBOX_ENABLED) {
        const p = rbPlayerRef.current;
        if (p) p.pause();
      } else {
        audioRef.current?.pause();
      }
      return;
    }
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "command", action: "pause", token: localStorage.getItem("token") }));
      return;
    }
    pause();
  };

  const onNext = () => {
    if (player === "upload") {
      const q = queueRef.current;
      const cur = queueIndexRef.current;
      let nextIdx: number;
      if (shuffleRef.current && q.length > 1) {
        do { nextIdx = Math.floor(Math.random() * q.length); } while (nextIdx === cur);
      } else {
        nextIdx = cur + 1;
      }
      const nextTrack = q[nextIdx] ?? (repeatModeRef.current === "all" ? q[0] : null);
      const resolvedIdx = q[nextIdx] ? nextIdx : (repeatModeRef.current === "all" ? 0 : -1);
      if (!nextTrack || resolvedIdx < 0) return;
      setQueueIndex(resolvedIdx);
      setNowPlaying({
        title: nextTrack.title,
        artist: nextTrack.artist,
        artistUri: "",
        songUri: nextTrack.songUri ?? "",
        albumUri: "",
        duration: nextTrack.duration,
        progress: 0,
        albumArt: nextTrack.albumArt ?? undefined,
        isPlaying: true,
        sha256: nextTrack.sha256,
        liked: false,
      });
      return;
    }
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "command", action: "next", token: localStorage.getItem("token") }));
      return;
    }
    next();
  };

  const onPrevious = () => {
    if (player === "upload") {
      // Restart track if past 3 s, else go to previous
      if (ROCKBOX_ENABLED) {
        const p = rbPlayerRef.current;
        if (p && (nowPlayingRef.current?.progress ?? 0) > 3000) {
          p.seek(0);
          setNowPlaying((prev) => (prev ? { ...prev, progress: 0 } : prev));
          return;
        }
      } else {
        const audio = audioRef.current;
        if (audio && audio.currentTime > 3) {
          audio.currentTime = 0;
          setNowPlaying((prev) => (prev ? { ...prev, progress: 0 } : prev));
          return;
        }
      }
      const prevIdx = queueIndexRef.current - 1;
      const prevTrack = queueRef.current[prevIdx];
      if (!prevTrack) return;
      setQueueIndex(prevIdx);
      setNowPlaying({
        title: prevTrack.title,
        artist: prevTrack.artist,
        artistUri: "",
        songUri: prevTrack.songUri ?? "",
        albumUri: "",
        duration: prevTrack.duration,
        progress: 0,
        albumArt: prevTrack.albumArt ?? undefined,
        isPlaying: true,
        sha256: prevTrack.sha256,
        liked: false,
      });
      return;
    }
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "command", action: "previous", token: localStorage.getItem("token") }));
      return;
    }
    previous();
  };

  const onSeek = (position: number) => {
    if (player === "upload") {
      if (ROCKBOX_ENABLED) {
        const p = rbPlayerRef.current;
        if (p) p.seek(position);
      } else {
        if (audioRef.current) audioRef.current.currentTime = position / 1000;
      }
      setNowPlaying((prev) => (prev ? { ...prev, progress: position } : prev));
      return;
    }
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "command", action: "seek", token: localStorage.getItem("token"), args: { position } }));
      return;
    }
    seek(position);
  };

  const fetchCurrentlyPlaying = useCallback(async () => {
    // Use ref to avoid stale closure — always read current player value
    const currentPlayer = playerRef.current;
    // Don't disturb an active non-spotify player
    if (currentPlayer === "rockbox" || currentPlayer === "upload") return;
    const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
      headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (data.item) {
      // Only update if no player is active or spotify is already active
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
        // Upload player tracks its own progress via audio events
        if (playerRef.current === "upload") return prev;
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
    if (player === "rockbox" || player === "upload") return;
    if (nowPlayingInterval.current) clearInterval(nowPlayingInterval.current);
    nowPlayingInterval.current = window.setInterval(() => { fetchCurrentlyPlaying(); }, 15000);
    fetchCurrentlyPlaying();
    return () => { if (nowPlayingInterval.current) clearInterval(nowPlayingInterval.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    const ws = new WebSocket(`${API_URL.replace("http", "ws")}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "register", clientName: "rocksky", token: localStorage.getItem("token") }));
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = window.setInterval(() => {
        ws.send(JSON.stringify({ type: "heartbeat", token: localStorage.getItem("token") }));
      }, 3000);

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "message" && msg.data?.type === "track") {
          // Mark rockbox as available regardless of active player
          setRockboxAvailable(true);
          // Don't disturb an active non-rockbox player
          if (playerRef.current !== null && playerRef.current !== "rockbox") return;
          if (lastFetchedRef.current && Date.now() - lastFetchedRef.current < 3000) return;
          if (nowPlayingRef.current !== null && nowPlayingRef.current.isPlaying === undefined) return;
          setNowPlaying({
            ...(nowPlayingRef.current ? nowPlayingRef.current : {}),
            title: msg.data.title,
            artist: msg.data.album_artist || msg.data.artist,
            artistUri: msg.data.artist_uri,
            songUri: msg.data.song_uri,
            albumUri: msg.data.album_uri,
            duration: msg.data.length,
            progress: msg.data.elapsed,
            albumArt: _.get(msg, "data.album_art"),
            isPlaying: !!nowPlayingRef.current?.isPlaying,
            sha256: msg.data.sha256,
            liked: likedRef.current[msg.data.song_uri] !== undefined ? likedRef.current[msg.data.song_uri] : msg.data.liked,
          });
          setPlayer("rockbox");
          lastFetchedRef.current = Date.now();
        }
        // Status messages only apply if rockbox is the active player
        if (playerRef.current !== "rockbox") return;
        if (msg.data?.status === 0) setNowPlaying(null);
        if (msg.data?.status === 1 && nowPlayingRef.current) setNowPlaying({ ...nowPlayingRef.current, isPlaying: true });
        if ((msg.data?.status === 2 || msg.data?.status === 3) && nowPlayingRef.current) setNowPlaying({ ...nowPlayingRef.current, isPlaying: false });
      };
      consola.info(">> WebSocket connection opened");
    };

    return () => {
      if (ws) { if (heartbeatInterval.current) clearInterval(heartbeatInterval.current); ws.close(); }
      consola.log(">> WebSocket connection closed");
    };
  }, []);

  // Media Session API — keeps lock-screen / OS media notification in sync
  useEffect(() => {
    if (!("mediaSession" in navigator) || !nowPlaying) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      artwork: nowPlaying.albumArt
        ? [{ src: nowPlaying.albumArt, sizes: "512x512" }]
        : [],
    });
    navigator.mediaSession.setActionHandler("play", onPlay);
    navigator.mediaSession.setActionHandler("pause", onPause);
    navigator.mediaSession.setActionHandler("previoustrack", onPrevious);
    navigator.mediaSession.setActionHandler("nexttrack", onNext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.albumArt]);

  if (!nowPlaying) return <></>;

  return (
    <>
      {/* HTML5 audio fallback (used when page is not cross-origin isolated) */}
      {!ROCKBOX_ENABLED && <audio ref={audioRef} style={{ display: "none" }} />}

      {/* Queue panel */}
      {queuePanelOpen && player === "upload" && (
        <>
          <QueueOverlay onClick={() => setQueuePanelOpen(false)} />
          <QueuePanel
            queue={queue}
            queueIndex={queueIndex}
            onClose={() => setQueuePanelOpen(false)}
            onPlayIndex={(idx) => {
              setQueueIndex(idx);
              const track = queue[idx];
              if (!track) return;
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
            }}
            onRemove={(idx) => {
              const newQueue = queue.filter((_, i) => i !== idx);
              setQueue(newQueue);
              if (idx < queueIndex) {
                setQueueIndex(queueIndex - 1);
              } else if (idx === queueIndex) {
                const next = newQueue[queueIndex] ?? newQueue[queueIndex - 1];
                if (next) {
                  setNowPlaying({
                    title: next.title,
                    artist: next.artist,
                    artistUri: "",
                    songUri: next.songUri ?? "",
                    albumUri: "",
                    duration: next.duration,
                    progress: 0,
                    albumArt: next.albumArt ?? undefined,
                    isPlaying: true,
                    sha256: next.sha256,
                    liked: false,
                  });
                  setQueueIndex(Math.min(queueIndex, newQueue.length - 1));
                }
              }
            }}
            onReorder={(newQueue) => setQueue(newQueue)}
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
          showQueueButton={player === "upload"}
          queuePanelOpen={queuePanelOpen}
          onPlaylist={() => setQueuePanelOpen((o) => !o)}
          onClose={() => setFullscreenOpen(false)}
          isUploadPlayer={player === "upload"}
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
        return (
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
            {rockboxAvailable && (
              <PlayerSelectorItem
                active={player === "rockbox"}
                onClick={() => { setPlayer("rockbox"); setPlayerSelectorOpen(false); }}
              >
                <PlayerDot active={player === "rockbox"} />
                Rockbox
              </PlayerSelectorItem>
            )}
            {queue.length > 0 && (
              <PlayerSelectorItem
                active={player === "upload"}
                onClick={() => { setPlayer("upload"); setPlayerSelectorOpen(false); }}
              >
                <PlayerDot active={player === "upload"} />
                My Library
              </PlayerSelectorItem>
            )}
          </PlayerSelectorPopup>
        </>
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
        onEqualizer={() => {}}
        onPlaylist={() => setQueuePanelOpen((o) => !o)}
        onSeek={onSeek}
        isPlaying={nowPlaying.isPlaying}
        onLike={onLike}
        onDislike={onDislike}
        showQueueButton={player === "upload"}
        queuePanelOpen={queuePanelOpen}
        fullscreenOpen={fullscreenOpen}
        onOpenFullscreen={() => setFullscreenOpen(true)}
        isUploadPlayer={player === "upload"}
        shuffle={shuffle}
        repeatMode={repeatMode}
        onShuffle={() => setShuffle((s) => !s)}
        onRepeat={() => setRepeatMode((r: RepeatMode) => r === "off" ? "all" : r === "all" ? "one" : "off")}
      />
    </>
  );
}

export default StickyPlayerWithData;
