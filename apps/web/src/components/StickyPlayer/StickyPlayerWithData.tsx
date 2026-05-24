import styled from "@emotion/styled";
import axios from "axios";
import { useAtom, useAtomValue } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useRockboxDSP } from "../../hooks/useRockboxDSP";
import EqualizerModal from "../EqualizerModal/EqualizerModal";

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
  const [equalizerOpen, setEqualizerOpen] = useState(false);
  const speakerRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useRockboxDSP(audioRef);
  const audioBlobUrlRef = useRef<string | null>(null);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  // Stop upload audio when switching to another player
  useEffect(() => {
    if (player === "upload") return;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    if (audioBlobUrlRef.current) { URL.revokeObjectURL(audioBlobUrlRef.current); audioBlobUrlRef.current = null; }
  }, [player]);

  // Load audio when upload player queue position changes
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
    const onPlay = () =>
      setNowPlaying((prev) => (prev ? { ...prev, isPlaying: true } : prev));
    const onPause = () =>
      setNowPlaying((prev) => (prev ? { ...prev, isPlaying: false } : prev));
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

  const onPlay = async () => {
    if (player === "upload") {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audio.src) {
        await ensureStreamToken();
        const track = queueRef.current[queueIndexRef.current];
        if (!track) return;
        audio.src = getStreamUrl(track.uploadId);
      }
      audio.play().catch(() => {});
      return;
    }
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "command", action: "play", token: localStorage.getItem("token") }));
      return;
    }
    play();
  };

  const onPause = () => {
    if (player === "upload") { audioRef.current?.pause(); return; }
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
      const audio = audioRef.current;
      if (audio && audio.currentTime > 3) {
        audio.currentTime = 0;
        setNowPlaying((prev) => (prev ? { ...prev, progress: 0 } : prev));
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
      if (audioRef.current) audioRef.current.currentTime = position / 1000;
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
    const currentPlayer = playerRef.current;
    if (currentPlayer === "rockbox" || currentPlayer === "upload") return;
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
          setRockboxAvailable(true);
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
      {/* Hidden audio element for upload player */}
      <audio ref={audioRef} crossOrigin="anonymous" style={{ display: "none" }} />

      {/* Equalizer modal */}
      {equalizerOpen && <EqualizerModal onClose={() => setEqualizerOpen(false)} />}

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
          onEqualizer={player === "upload" ? () => setEqualizerOpen(true) : () => {}}
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
                onClick={() => {
                  if (player !== "upload") {
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
                  setPlayer("upload");
                  setPlayerSelectorOpen(false);
                }}
              >
                <PlayerDot active={player === "upload"} />
                This web browser
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
        onEqualizer={player === "upload" ? () => setEqualizerOpen(true) : () => {}}
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
