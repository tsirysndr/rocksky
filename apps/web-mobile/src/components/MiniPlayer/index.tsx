import {
  IconHeart,
  IconHeartFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import axios from "axios";
import { API_URL } from "../../consts";
import _ from "lodash";

export default function MiniPlayer() {
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const [player, setPlayer] = useAtom(playerAtom);
  const { like, unlike } = useLike();
  const { play, pause, next } = useSpotify();
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatInterval = useRef<number | null>(null);
  const progressInterval = useRef<number | null>(null);
  const nowPlayingRef = useRef(nowPlaying);
  const playerRef = useRef(player);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const likedRef = useRef(liked);

  const fetchCurrentlyPlaying = useCallback(async () => {
    if (playerRef.current === "rockbox") return;
    try {
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
          liked:
            likedRef.current[data.songUri] !== undefined
              ? likedRef.current[data.songUri]
              : data.liked,
        });
        setPlayer("spotify");
      } else if (playerRef.current === "spotify") {
        setNowPlaying(null);
        setPlayer(null);
      }
    } catch {
      // no spotify session
    }
  }, [setNowPlaying, setPlayer]);

  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    playerRef.current = player;
    likedRef.current = liked;
  }, [nowPlaying, player, liked]);

  // Progress ticker
  useEffect(() => {
    progressInterval.current = window.setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        if (prev.progress >= prev.duration) return prev;
        return { ...prev, progress: prev.progress + 100 };
      });
    }, 100);
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [setNowPlaying]);

  // Spotify polling
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    fetchCurrentlyPlaying();
    const id = window.setInterval(fetchCurrentlyPlaying, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket for Rockbox
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    const wsUrl = (import.meta.env.VITE_API_URL || "http://localhost:8000")
      .replace("https", "wss")
      .replace("http", "ws");
    const ws = new WebSocket(`${wsUrl}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "register",
        clientName: "rocksky-mobile",
        token: localStorage.getItem("token"),
      }));
      heartbeatInterval.current = window.setInterval(() => {
        ws.send(JSON.stringify({ type: "heartbeat", token: localStorage.getItem("token") }));
      }, 3000);

      ws.onmessage = (event) => {
        if (playerRef.current !== "rockbox" && playerRef.current !== null) return;
        const msg = JSON.parse(event.data);
        if (msg.type === "message" && msg.data?.type === "track") {
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
          } as typeof nowPlaying extends null ? never : NonNullable<typeof nowPlaying>);
          setPlayer("rockbox");
        }
        if (msg.data?.status === 0) setNowPlaying(null);
        if (msg.data?.status === 1 && nowPlayingRef.current)
          setNowPlaying({ ...nowPlayingRef.current, isPlaying: true });
        if ((msg.data?.status === 2 || msg.data?.status === 3) && nowPlayingRef.current)
          setNowPlaying({ ...nowPlayingRef.current, isPlaying: false });
      };
    };

    return () => {
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      ws.close();
    };
  }, [setNowPlaying, setPlayer]);

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
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: "command", action: "next", token: localStorage.getItem("token"),
      }));
      return;
    }
    next();
  };

  if (!nowPlaying) return null;

  const progress =
    nowPlaying.duration > 0
      ? (nowPlaying.progress / nowPlaying.duration) * 100
      : 0;

  const songPath = nowPlaying.songUri
    ? `/${nowPlaying.songUri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;

  return (
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

      <div className="flex items-center h-[68px] px-4 gap-3">
        {/* Album art */}
        {nowPlaying.albumArt && (
          <img
            src={nowPlaying.albumArt}
            alt="album"
            className="w-12 h-12 rounded-lg object-cover shrink-0"
          />
        )}

        {/* Track info */}
        <div className="flex-1 min-w-0">
          {songPath ? (
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
        <div className="flex items-center gap-3 shrink-0">
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
  );
}
