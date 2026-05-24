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
  IconAdjustmentsHorizontal,
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
import { useRockboxDSP } from "../../hooks/useRockboxDSP";
import EqualizerSheet from "../EqualizerSheet";
import PlayerScreen from "../PlayerScreen";
import axios from "axios";
import { API_URL } from "../../consts";
import _ from "lodash";
import { consola } from "consola";

// Encode decoded PCM samples to a 16-bit WAV blob for HTML5 audio playback.
function pcmToWavBlob(channelData: Float32Array[], sampleRate: number): Blob {
  const nc = channelData.length;
  const ns = channelData[0].length;
  const buf = new ArrayBuffer(44 + ns * nc * 2);
  const v = new DataView(buf);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + ns * nc * 2, true);
  w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, nc, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nc * 2, true); v.setUint16(32, nc * 2, true);
  v.setUint16(34, 16, true); w(36, "data");
  v.setUint32(40, ns * nc * 2, true);
  let off = 44;
  for (let i = 0; i < ns; i++) {
    for (let ch = 0; ch < nc; ch++) {
      const s = Math.max(-1, Math.min(1, channelData[ch][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

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
  const [eqSheetOpen, setEqSheetOpen] = useState(false);
  const [shuffle, setShuffle] = useAtom(shuffleAtom);
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom);
  const shuffleRef = useRef(shuffle);
  const repeatModeRef = useRef(repeatMode);

  // Hidden audio element for upload player
  const audioRef = useRef<HTMLAudioElement>(null);

  useRockboxDSP(audioRef);
  useUploadScrobble(audioRef);
  const audioBlobUrlRef = useRef<string | null>(null);

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
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    if (audioBlobUrlRef.current) { URL.revokeObjectURL(audioBlobUrlRef.current); audioBlobUrlRef.current = null; }
  }, [player]);

  // Load audio when upload track changes
  useEffect(() => {
    if (player !== "upload") return;
    const track = queue[queueIndex];
    if (!track) return;

    if (audioBlobUrlRef.current) { URL.revokeObjectURL(audioBlobUrlRef.current); audioBlobUrlRef.current = null; }

    let cancelled = false;
    ensureStreamToken().then(() => {
      if (cancelled) return;
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = getStreamUrl(track.uploadId);
      if (nowPlayingRef.current?.isPlaying) audio.play().catch(() => {});
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, queueIndex]);

  // Audio event listeners for upload player
  useEffect(() => {
    if (player !== "upload") return;
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setNowPlaying((prev) =>
        prev ? { ...prev, progress: Math.floor(audio.currentTime * 1000) } : prev,
      );
    };
    const onPlay = () => setNowPlaying((prev) => prev ? { ...prev, isPlaying: true } : prev);
    const onPause = () => setNowPlaying((prev) => prev ? { ...prev, isPlaying: false } : prev);
    const onEnded = () => {
      const q = queueRef.current;
      const cur = queueIndexRef.current;
      if (repeatModeRef.current === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        setNowPlaying((prev) => prev ? { ...prev, progress: 0, isPlaying: true } : prev);
        return;
      }
      let nextIdx: number;
      if (shuffleRef.current && q.length > 1) {
        do { nextIdx = Math.floor(Math.random() * q.length); } while (nextIdx === cur);
      } else {
        nextIdx = cur + 1;
      }
      const nextTrack = q[nextIdx] ?? (repeatModeRef.current === "all" ? q[0] : null);
      const resolvedIdx = q[nextIdx] ? nextIdx : (repeatModeRef.current === "all" ? 0 : -1);
      if (nextTrack && resolvedIdx >= 0) {
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
      }
    };
    // Fallback: when HTML5 can't decode the format, use audio-type to identify it
    // and audio-decode to transcode to WAV for playback.
    const onError = async () => {
      const errCode = audio.error?.code;
      if (errCode !== MediaError.MEDIA_ERR_DECODE && errCode !== MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return;
      if (!audio.src || audio.src.startsWith("blob:")) return;
      const srcUrl = audio.src;
      try {
        const response = await fetch(srcUrl);
        const arrayBuffer = await response.arrayBuffer();
        const { default: audioType } = await import("audio-type");
        const format = audioType(new Uint8Array(arrayBuffer));
        consola.info("[upload] HTML5 failed for format:", format, "— falling back to audio-decode");
        const { default: decode } = await import("audio-decode");
        const { channelData, sampleRate } = await decode(arrayBuffer);
        const blob = pcmToWavBlob(channelData, sampleRate);
        if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = URL.createObjectURL(blob);
        audio.src = audioBlobUrlRef.current;
        if (nowPlayingRef.current?.isPlaying) audio.play().catch(() => {});
      } catch (e) {
        consola.warn("[upload] audio-decode fallback failed:", e);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Progress ticker (Spotify / Rockbox device)
  useEffect(() => {
    progressInterval.current = window.setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        if (playerRef.current === "upload") return prev;
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

  const onPlayPause = async () => {
    if (!nowPlaying) return;
    if (player === "upload") {
      const audio = audioRef.current;
      if (!audio) return;
      if (nowPlaying.isPlaying) {
        audio.pause();
      } else if (!audio.src) {
        await ensureStreamToken();
        const track = queueRef.current[queueIndexRef.current];
        if (!track) return;
        audio.src = getStreamUrl(track.uploadId);
        audio.play().catch(() => {});
      } else {
        audio.play().catch(() => {});
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
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setNowPlaying((prev) => prev ? { ...prev, progress: 0 } : prev);
      return;
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
    const audio = audioRef.current;
    if (audio) audio.currentTime = positionMs / 1000;
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
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", onPrevious);
    navigator.mediaSession.setActionHandler("nexttrack", onNext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.title, nowPlaying?.artist, nowPlaying?.albumArt]);

  if (!nowPlaying) return <audio ref={audioRef} crossOrigin="anonymous" style={{ display: "none" }} />;

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
      <audio ref={audioRef} crossOrigin="anonymous" style={{ display: "none" }} />

      <EqualizerSheet open={eqSheetOpen} onClose={() => setEqSheetOpen(false)} />

      <PlayerScreen
        onSeek={onSeek}
        onPlayPause={onPlayPause}
        onNext={onNext}
        onPrevious={onPrevious}
        onSelectQueueIndex={onSelectQueueIndex}
        onRemoveFromQueue={onRemoveFromQueue}
        onEqualizer={() => setEqSheetOpen(true)}
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
          if (src === "upload" && player !== "upload") {
            const track = queue[queueIndex];
            if (track) {
              setNowPlaying({
                title: track.title,
                artist: track.artist,
                artistUri: "",
                songUri: track.songUri ?? "",
                albumUri: "",
                duration: track.duration,
                progress: 0,
                albumArt: track.albumArt ?? undefined,
                isPlaying: false,
                sha256: track.sha256,
                liked: false,
              });
            }
          }
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
            {showSourceBtn && (
              <button
                onClick={() => setSourceSheetOpen(true)}
                className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg"
              >
                <IconDeviceSpeaker size={18} color={player !== null ? "var(--color-primary)" : "var(--color-text-muted)"} />
              </button>
            )}
            {player === "upload" && (
              <button
                onClick={() => setEqSheetOpen(true)}
                className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg"
              >
                <IconAdjustmentsHorizontal size={18} color="var(--color-text-muted)" />
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
