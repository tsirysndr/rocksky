import styled from "@emotion/styled";
import { IconGripVertical, IconMusic, IconX } from "@tabler/icons-react";
import axios from "axios";
import { useAtom, useAtomValue } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import { queueAtom, queueIndexAtom, queuePanelOpenAtom } from "../../atoms/queue";
import { API_URL } from "../../consts";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import StickyPlayer from "./StrickyPlayer";
import { consola } from "consola";
import { useQueryClient } from "@tanstack/react-query";
import { feedGeneratorUriAtom } from "../../atoms/feed";
import { getStreamUrl } from "../../api/uploads";
import { useQueuePersistence } from "../../hooks/useQueuePersistence";

// ---------------------------------------------------------------------------
// Queue Panel
// ---------------------------------------------------------------------------

const QueueOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 99;
`;

const QueuePanel = styled.div`
  position: fixed;
  bottom: 128px;
  right: 24px;
  width: 340px;
  max-height: 480px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.18);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const QueueHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-menu-hover);
  flex-shrink: 0;
`;

const QueueTitle = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const QueueCount = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-left: 6px;
`;

const CloseBtn = styled.button`
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  &:hover { background: var(--color-menu-hover); }
`;

const QueueList = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
`;

const QueueRow = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  background: ${({ active }) =>
    active ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "transparent"};
  &:hover {
    background: ${({ active }) =>
      active
        ? "color-mix(in srgb, var(--color-primary) 8%, transparent)"
        : "var(--color-menu-hover)"};
  }
`;

const QueueArt = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--color-menu-hover);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const QueueTrackInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const QueueTrackTitle = styled.p<{ active: boolean }>`
  margin: 0;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: ${({ active }) => (active ? "var(--color-primary)" : "var(--color-text)")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const QueueTrackMeta = styled.p`
  margin: 0;
  font-size: 0.725rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// ---------------------------------------------------------------------------
// StickyPlayerWithData
// ---------------------------------------------------------------------------

function StickyPlayerWithData() {
  useQueuePersistence();
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

  // Upload player state
  const queue = useAtomValue(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const [queuePanelOpen, setQueuePanelOpen] = useAtom(queuePanelOpenAtom);
  const audioRef = useRef<HTMLAudioElement>(null);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  // Fetch stream URL and load audio when upload player queue position changes
  useEffect(() => {
    if (player !== "upload") return;
    const track = queue[queueIndex];
    if (!track) return;

    getStreamUrl(track.uploadId).then(({ url }) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      audio.play().catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, queueIndex]);

  // Sync audio currentTime → nowPlayingAtom.progress (upload player only)
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
      const nextIdx = queueIndexRef.current + 1;
      const nextTrack = queueRef.current[nextIdx];
      if (nextTrack) {
        setQueueIndex(nextIdx);
        setNowPlaying({
          title: nextTrack.title,
          artist: nextTrack.artist,
          artistUri: "",
          songUri: "",
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
    if (player === "upload") { audioRef.current?.play(); return; }
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
      const nextIdx = queueIndexRef.current + 1;
      const nextTrack = queueRef.current[nextIdx];
      if (!nextTrack) return;
      setQueueIndex(nextIdx);
      setNowPlaying({
        title: nextTrack.title,
        artist: nextTrack.artist,
        artistUri: "",
        songUri: "",
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
      // Restart track if past 3s, else go to previous
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
        songUri: "",
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
    if (player === "rockbox" || player === "upload") return;
    const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
      headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
    });
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
        liked: likedRef.current[data.songUri] !== undefined ? likedRef.current[data.songUri] : data.liked,
      });
      setPlayer("spotify");
    } else {
      if (player === "spotify") { setNowPlaying(null); setPlayer(null); }
    }
    lastFetchedRef.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNowPlaying, player]);

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
        if (playerRef.current !== "rockbox" && playerRef.current !== null) return;
        const msg = JSON.parse(event.data);
        if (msg.type === "message" && msg.data?.type === "track") {
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

  if (!nowPlaying) return <></>;

  return (
    <>
      {/* Hidden audio element for upload player */}
      <audio ref={audioRef} style={{ display: "none" }} />

      {/* Queue panel */}
      {queuePanelOpen && player === "upload" && (
        <>
          <QueueOverlay onClick={() => setQueuePanelOpen(false)} />
          <QueuePanel>
            <QueueHeader>
              <div>
                <QueueTitle style={{ display: "inline" }}>Queue</QueueTitle>
                <QueueCount>{queue.length} track{queue.length !== 1 ? "s" : ""}</QueueCount>
              </div>
              <CloseBtn onClick={() => setQueuePanelOpen(false)}>
                <IconX size={16} />
              </CloseBtn>
            </QueueHeader>
            <QueueList>
              {queue.map((track, idx) => (
                <QueueRow
                  key={`${track.uploadId}-${idx}`}
                  active={idx === queueIndex}
                  onClick={() => {
                    if (idx === queueIndex) return;
                    setQueueIndex(idx);
                    setNowPlaying({
                      title: track.title,
                      artist: track.artist,
                      artistUri: "",
                      songUri: "",
                      albumUri: "",
                      duration: track.duration,
                      progress: 0,
                      albumArt: track.albumArt ?? undefined,
                      isPlaying: true,
                      sha256: track.sha256,
                      liked: false,
                    });
                  }}
                >
                  <QueueArt>
                    {track.albumArt ? (
                      <img src={track.albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <IconMusic size={14} color="var(--color-text-muted)" />
                    )}
                  </QueueArt>
                  <QueueTrackInfo>
                    <QueueTrackTitle active={idx === queueIndex}>{track.title}</QueueTrackTitle>
                    <QueueTrackMeta>{track.artist} — {track.album}</QueueTrackMeta>
                  </QueueTrackInfo>
                  <IconGripVertical size={14} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                </QueueRow>
              ))}
            </QueueList>
          </QueuePanel>
        </>
      )}

      <StickyPlayer
        nowPlaying={nowPlaying}
        onPlay={onPlay}
        onPause={onPause}
        onPrevious={onPrevious}
        onNext={onNext}
        onSpeaker={() => {}}
        onEqualizer={() => {}}
        onPlaylist={() => setQueuePanelOpen((o) => !o)}
        onSeek={onSeek}
        isPlaying={nowPlaying.isPlaying}
        onLike={onLike}
        onDislike={onDislike}
        showQueueButton={player === "upload"}
        queuePanelOpen={queuePanelOpen}
      />
    </>
  );
}

export default StickyPlayerWithData;
