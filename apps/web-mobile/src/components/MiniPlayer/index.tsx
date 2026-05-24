import {
  IconHeart,
  IconHeartFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
  IconDeviceSpeaker,
  IconMusic,
  IconX,
} from "@tabler/icons-react";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import { playerScreenOpenAtom } from "../../atoms/playerScreen";
import { queueAtom, queueIndexAtom } from "../../atoms/queue";
import { shuffleAtom, repeatModeAtom, type RepeatMode } from "../../atoms/playback";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import { useQueuePersistence } from "../../hooks/useQueuePersistence";
import { useUploadScrobble } from "../../hooks/useUploadScrobble";
import { getStreamUrl, ensureStreamToken } from "../../api/uploads";
import PlayerScreen from "../PlayerScreen";
import axios from "axios";
import { API_URL } from "../../consts";
import _ from "lodash";

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

/** True when SharedArrayBuffer (required by Rockbox WASM) is available. */
const ROCKBOX_ENABLED = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;

// ---------------------------------------------------------------------------
// Source selector bottom sheet
// ---------------------------------------------------------------------------

function SourceSheet({
  open,
  onClose,
  player,
  rockboxAvailable,
  queueLength,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  player: string | null;
  rockboxAvailable: boolean;
  queueLength: number;
  onSelect: (src: "spotify" | "rockbox" | "upload") => void;
}) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl"
        style={{ backgroundColor: "var(--color-surface)", borderTop: "1px solid var(--color-border)" }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p className="m-0 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Select Source</p>
          <button onClick={onClose} className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg" style={{ color: "var(--color-text-muted)" }}>
            <IconX size={18} />
          </button>
        </div>
        {rockboxAvailable && (
          <SourceItem label="Rockbox" active={player === "rockbox"} onClick={() => { onSelect("rockbox"); onClose(); }} />
        )}
        {queueLength > 0 && (
          <SourceItem label="My Library" active={player === "upload"} onClick={() => { onSelect("upload"); onClose(); }} />
        )}
        <SourceItem label="Spotify" active={player === "spotify"} onClick={() => { onSelect("spotify"); onClose(); }} />
        <button
          onClick={onClose}
          className="w-full py-4 text-center border-none bg-transparent cursor-pointer text-sm font-semibold"
          style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function SourceItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-4 border-none bg-transparent cursor-pointer text-left"
      style={{
        backgroundColor: active ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-text)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: active ? "var(--color-primary)" : "var(--color-text-muted)" }}
      />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// MiniPlayer
// ---------------------------------------------------------------------------

export default function MiniPlayer() {
  useQueuePersistence();
  useUploadScrobble();
  const setPlayerScreenOpen = useSetAtom(playerScreenOpenAtom);

  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const [player, setPlayer] = useAtom(playerAtom);
  const [queue, setQueue] = useAtom(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const { like, unlike } = useLike();
  const { play, pause, next } = useSpotify();
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const progressInterval = useRef<number | null>(null);
  const lastFetchedRef = useRef(0);
  const nowPlayingRef = useRef(nowPlaying);
  const playerRef = useRef(player);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const likedRef = useRef(liked);
  const [rockboxAvailable, setRockboxAvailable] = useState(false);
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const [shuffle, setShuffle] = useAtom(shuffleAtom);
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom);
  const shuffleRef = useRef(shuffle);
  const repeatModeRef = useRef(repeatMode);

  // Rockbox WASM refs
  const rbPlayerRef = useRef<any>(null);
  const rbNextOurIdxRef = useRef(-1);
  const rbLastPlaylistIdxRef = useRef(-1);
  const rbAdvancedRef = useRef(false);
  const rbListenersSetRef = useRef(false);

  // HTML5 audio fallback (used when page is not cross-origin isolated)
  const audioRef = useRef<HTMLAudioElement>(null);

  // Prevent autoplay on initial page load (queue restored from storage)
  const hasMountedRef = useRef(false);
  const [playTrigger, setPlayTrigger] = useState(0);

  // Keep refs in sync
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    playerRef.current = player;
    likedRef.current = liked;
    queueRef.current = queue;
    queueIndexRef.current = queueIndex;
    shuffleRef.current = shuffle;
    repeatModeRef.current = repeatMode;
  }, [nowPlaying, player, liked, queue, queueIndex, shuffle, repeatMode]);

  const fetchCurrentlyPlaying = useCallback(async () => {
    if (playerRef.current === "rockbox" || playerRef.current === "upload") return;
    try {
      const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
        headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      // Guard: player may have changed while awaiting
      if (playerRef.current !== null && playerRef.current !== "spotify") return;
      if (data.item) {
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
          liked:
            likedRef.current[data.songUri] !== undefined
              ? likedRef.current[data.songUri]
              : data.liked,
        });
        setPlayer("spotify");
        lastFetchedRef.current = Date.now();
      } else if (playerRef.current === "spotify") {
        setNowPlaying(null);
        setPlayer(null);
      }
    } catch {
      // no spotify session
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNowPlaying, setPlayer]);

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

  // Rockbox: sync repeat mode (WASM path only)
  useEffect(() => {
    if (!ROCKBOX_ENABLED || player !== "upload") return;
    const p = rbPlayerRef.current;
    if (!p) return;
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
  useEffect(() => {
    if (player !== "upload") return;
    const track = queue[queueIndex];
    if (!track) return;

    // On initial page load (atoms restored from storage), show track info without playing.
    if (!hasMountedRef.current) {
      setNowPlaying({ title: track.title, artist: track.artist, artistUri: "", songUri: track.songUri ?? "", albumUri: "", duration: track.duration, progress: 0, albumArt: track.albumArt ?? undefined, isPlaying: false, sha256: track.sha256, liked: false });
      return;
    }

    // HTML5 fallback path
    if (!ROCKBOX_ENABLED) {
      console.info("[upload] HTML5 audio fallback — page not cross-origin isolated");
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

    // Rockbox auto-advanced — just clear the flag, don't re-play
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

        p.on("progress", ({ elapsed_ms, duration_ms, status }: { elapsed_ms: number; duration_ms: number; status: number }) => {
          if (playerRef.current !== "upload") return;
          if (status === 0) return;
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

        p.on("status", ({ status }: { status: number }) => {
          if (playerRef.current !== "upload") return;
          if (status === 2) {
            setNowPlaying((prev) => (prev ? { ...prev, isPlaying: false } : prev));
          }
        });

        p.on("playlist", ({ index }: { index: number }) => {
          if (playerRef.current !== "upload") return;
          if (index <= rbLastPlaylistIdxRef.current) return;
          rbLastPlaylistIdxRef.current = index;

          const nextOurIdx = rbNextOurIdxRef.current;
          if (nextOurIdx < 0) return;

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

          // Compute and enqueue next lookahead
          const q = queueRef.current;
          const cur = nextOurIdx;
          const repeat = repeatModeRef.current;
          const shuffled = shuffleRef.current;
          let newNextIdx: number;
          if (repeat === "one") {
            newNextIdx = cur;
          } else if (shuffled && q.length > 1) {
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

      // Apply repeat mode
      p.setRepeat(repeatModeRef.current === "one" ? 2 : 0);

      // Reset playlist tracking for fresh playUrl() call
      rbLastPlaylistIdxRef.current = -1;

      if (cancelled) return;
      p.playUrl(getStreamUrl(track.uploadId));
      p.resumeAudio().catch(() => {});

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

      // Preload next track for gapless transition
      const q = queue;
      const cur = queueIndex;
      const repeat = repeatModeRef.current;
      const shuffled = shuffleRef.current;
      let nextIdx: number;
      if (repeat === "one") {
        nextIdx = cur;
      } else if (shuffled && q.length > 1) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, queueIndex, playTrigger]);

  // Mark mount complete — MUST be declared after the play effect so it runs after on initial mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { hasMountedRef.current = true; }, []);

  // Progress ticker (Spotify / Rockbox device)
  useEffect(() => {
    progressInterval.current = window.setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        if (playerRef.current === "upload") return prev; // Rockbox provides its own ticks
        if (prev.progress >= prev.duration) {
          if (playerRef.current === "spotify") setTimeout(fetchCurrentlyPlaying, 2000);
          return prev;
        }
        return { ...prev, progress: prev.progress + 100 };
      });
    }, 100);
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spotify polling
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    fetchCurrentlyPlaying();
    const id = window.setInterval(fetchCurrentlyPlaying, 15000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket for Rockbox device
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    const wsUrl = API_URL.replace("https", "wss").replace("http", "ws");
    const ws = new WebSocket(`${wsUrl}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "register",
        clientName: "rocksky",
        token: localStorage.getItem("token"),
      }));

      heartbeatRef.current = window.setInterval(() => {
        ws.send(JSON.stringify({ type: "heartbeat", token: localStorage.getItem("token") }));
      }, 3000);

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "message" && msg.data?.type === "track") {
          setRockboxAvailable(true);
          if (playerRef.current !== null && playerRef.current !== "rockbox") return;
          if (lastFetchedRef.current && Date.now() - lastFetchedRef.current < 3000) return;
          if (!msg.data.title && !msg.data.artist && !msg.data.album_artist) return;
          setNowPlaying({
            ...(nowPlayingRef.current ?? {}),
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
            liked:
              likedRef.current[msg.data.song_uri] !== undefined
                ? likedRef.current[msg.data.song_uri]
                : msg.data.liked,
          } as NonNullable<typeof nowPlaying>);
          setPlayer("rockbox");
          lastFetchedRef.current = Date.now();
        }

        if (playerRef.current !== "rockbox") return;
        if (msg.data?.status === 0) setNowPlaying(null);
        if (msg.data?.status === 1 && nowPlayingRef.current)
          setNowPlaying({ ...nowPlayingRef.current, isPlaying: true });
        if ((msg.data?.status === 2 || msg.data?.status === 3) && nowPlayingRef.current)
          setNowPlaying({ ...nowPlayingRef.current, isPlaying: false });
      };
    };

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLike = () => {
    if (!nowPlaying) return;
    setLiked((prev) => ({ ...prev, [nowPlaying.songUri]: true }));
    like(nowPlaying.songUri);
    setNowPlaying((prev) => prev ? { ...prev, liked: true } : prev);
  };
  const onDislike = () => {
    if (!nowPlaying) return;
    setLiked((prev) => ({ ...prev, [nowPlaying.songUri]: false }));
    unlike(nowPlaying.songUri);
    setNowPlaying((prev) => prev ? { ...prev, liked: false } : prev);
  };

  const onPlayPause = () => {
    if (!nowPlaying) return;
    if (player === "upload") {
      if (ROCKBOX_ENABLED) {
        const p = rbPlayerRef.current;
        if (p) {
          if (nowPlaying.isPlaying) { p.pause(); } else { p.resumeAudio().catch(() => {}); p.play(); }
        } else {
          // First play after page load — trigger the play effect to init + load + play
          hasMountedRef.current = true;
          setPlayTrigger((t) => t + 1);
        }
      } else {
        const audio = audioRef.current;
        if (!audio) return;
        if (nowPlaying.isPlaying) {
          audio.pause();
        } else if (!audio.src) {
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
      socketRef.current.send(JSON.stringify({
        type: "command",
        action: nowPlaying.isPlaying ? "pause" : "play",
        token: localStorage.getItem("token"),
      }));
      return;
    }
    nowPlaying.isPlaying ? pause() : play();
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
      socketRef.current.send(JSON.stringify({
        type: "command", action: "next", token: localStorage.getItem("token"),
      }));
      return;
    }
    next();
  };

  const onPrevious = () => {
    if (player !== "upload") return;
    if (ROCKBOX_ENABLED) {
      const p = rbPlayerRef.current;
      if (p && (nowPlayingRef.current?.progress ?? 0) > 3000) {
        p.seek(0);
        setNowPlaying((prev) => prev ? { ...prev, progress: 0 } : prev);
        return;
      }
    } else {
      const audio = audioRef.current;
      if (audio && audio.currentTime > 3) {
        audio.currentTime = 0;
        setNowPlaying((prev) => prev ? { ...prev, progress: 0 } : prev);
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
  };

  const onSeek = useCallback((positionMs: number) => {
    if (ROCKBOX_ENABLED) {
      const p = rbPlayerRef.current;
      if (p) p.seek(positionMs);
    } else {
      const audio = audioRef.current;
      if (audio) audio.currentTime = positionMs / 1000;
    }
    setNowPlaying((prev) => prev ? { ...prev, progress: positionMs } : prev);
  }, [setNowPlaying]);

  const onSelectQueueIndex = useCallback((idx: number) => {
    const track = queueRef.current[idx];
    if (!track) return;
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
  }, [setQueueIndex, setNowPlaying]);

  const onRemoveFromQueue = useCallback((idx: number) => {
    setQueue((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const currentIdx = queueIndexRef.current;
      if (idx < currentIdx) {
        setQueueIndex(currentIdx - 1);
      } else if (idx === currentIdx) {
        const nextTrack = next[currentIdx] ?? next[currentIdx - 1];
        if (nextTrack) {
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
          setQueueIndex(Math.min(currentIdx, next.length - 1));
        }
      }
      return next;
    });
  }, [setQueue, setQueueIndex, setNowPlaying]);

  // Media Session API — keeps Android/iOS lock-screen / notification in sync
  useEffect(() => {
    if (!("mediaSession" in navigator) || !nowPlaying) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      artwork: nowPlaying.albumArt
        ? [{ src: nowPlaying.albumArt, sizes: "512x512" }]
        : [],
    });
    navigator.mediaSession.setActionHandler("play", () => {
      if (ROCKBOX_ENABLED) {
        const p = rbPlayerRef.current;
        if (p) { p.resumeAudio().catch(() => {}); p.play(); }
      } else {
        audioRef.current?.play().catch(() => {});
      }
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (ROCKBOX_ENABLED) {
        const p = rbPlayerRef.current;
        if (p) p.pause();
      } else {
        audioRef.current?.pause();
      }
    });
    navigator.mediaSession.setActionHandler("previoustrack", onPrevious);
    navigator.mediaSession.setActionHandler("nexttrack", onNext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.albumArt]);

  if (!nowPlaying) return !ROCKBOX_ENABLED ? <audio ref={audioRef} style={{ display: "none" }} /> : null;

  const progress =
    nowPlaying.duration > 0
      ? (nowPlaying.progress / nowPlaying.duration) * 100
      : 0;

  const songPath = nowPlaying.songUri
    ? `/${nowPlaying.songUri.split("at://")[1]?.replace("app.rocksky.", "")}`
    : null;

  const showSourceBtn = rockboxAvailable || queue.length > 0;

  return (
    <>
      {/* HTML5 audio fallback element (only mounted when crossOriginIsolated is false) */}
      {!ROCKBOX_ENABLED && <audio ref={audioRef} style={{ display: "none" }} />}

      <PlayerScreen
        onSeek={onSeek}
        onPlayPause={onPlayPause}
        onNext={onNext}
        onPrevious={onPrevious}
        onSelectQueueIndex={onSelectQueueIndex}
        onRemoveFromQueue={onRemoveFromQueue}
        queue={queue}
        queueIndex={queueIndex}
        shuffle={shuffle}
        repeatMode={repeatMode}
        onShuffle={() => setShuffle((s) => !s)}
        onRepeat={() => setRepeatMode((r: RepeatMode) => r === "off" ? "all" : r === "all" ? "one" : "off")}
      />

      <SourceSheet
        open={sourceSheetOpen}
        onClose={() => setSourceSheetOpen(false)}
        player={player}
        rockboxAvailable={rockboxAvailable}
        queueLength={queue.length}
        onSelect={(src) => {
          setPlayer(src);
          if (src === "spotify") fetchCurrentlyPlaying();
        }}
      />

      <div
        className="fixed left-0 right-0 z-30"
        style={{
          bottom: `calc(56px + env(safe-area-inset-bottom))`,
          backgroundColor: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          height: "var(--player-height)",
        }}
      >
        {/* Progress bar */}
        <div className="h-0.5 w-full" style={{ backgroundColor: "var(--color-border)" }}>
          <div
            className="h-full transition-all duration-100"
            style={{ width: `${progress}%`, backgroundColor: "var(--color-primary)" }}
          />
        </div>

        <div
          className="flex items-center h-[calc(var(--player-height)-2px)] px-4 gap-3"
          onClick={() => { if (player === "upload") setPlayerScreenOpen(true); }}
          style={{ cursor: player === "upload" ? "pointer" : "default" }}
        >
          {/* Album art */}
          {nowPlaying.albumArt ? (
            <img
              src={nowPlaying.albumArt}
              alt="album"
              className="w-12 h-12 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center"
              style={{ backgroundColor: "var(--color-surface-2)" }}
            >
              <IconMusic size={20} color="var(--color-text-muted)" strokeWidth={1.5} />
            </div>
          )}

          {/* Track info */}
          <div className="flex-1 min-w-0">
            {songPath && player !== "upload" ? (
              <Link
                to={songPath}
                className="block font-semibold text-sm truncate no-underline"
                style={{ color: "var(--color-text)" }}
              >
                {nowPlaying.title}
              </Link>
            ) : (
              <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>
                {nowPlaying.title}
              </p>
            )}
            <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>
              {nowPlaying.artist}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Source selector */}
            {showSourceBtn && (
              <button
                onClick={() => setSourceSheetOpen(true)}
                className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg"
              >
                <IconDeviceSpeaker size={18} color={player !== null ? "var(--color-primary)" : "var(--color-text-muted)"} />
              </button>
            )}

            {player === "upload" ? (
              <button
                onClick={onPrevious}
                className="p-1 border-none bg-transparent cursor-pointer"
              >
                <IconPlayerSkipBackFilled size={20} color="var(--color-text-muted)" />
              </button>
            ) : (
              <button
                onClick={nowPlaying.liked ? onDislike : onLike}
                className="p-1 border-none bg-transparent cursor-pointer"
              >
                {nowPlaying.liked ? (
                  <IconHeartFilled size={20} color="var(--color-primary)" />
                ) : (
                  <IconHeart size={20} color="var(--color-text-muted)" />
                )}
              </button>
            )}

            <button
              onClick={onPlayPause}
              className="w-10 h-10 rounded-full flex items-center justify-center border-none cursor-pointer"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {nowPlaying.isPlaying ? (
                <IconPlayerPauseFilled size={18} color="#fff" />
              ) : (
                <IconPlayerPlayFilled size={18} color="#fff" />
              )}
            </button>

            <button
              onClick={onNext}
              className="p-1 border-none bg-transparent cursor-pointer"
            >
              <IconPlayerSkipForwardFilled size={20} color="var(--color-text-muted)" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
