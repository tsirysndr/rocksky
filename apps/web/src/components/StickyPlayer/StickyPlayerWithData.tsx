import axios from "axios";
import { useAtom } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { playerAtom } from "../../atoms/player";
import { API_URL } from "../../consts";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import StickyPlayer from "./StrickyPlayer";

function StickyPlayerWithData() {
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

  const onLike = (uri: string) => {
    setLiked({
      ...liked,
      [uri]: true,
    });
    like(uri);
    setNowPlaying((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        liked: true,
      };
    });
  };

  const onDislike = (uri: string) => {
    setLiked({
      ...liked,
      [uri]: false,
    });
    unlike(uri);
    setNowPlaying((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        liked: false,
      };
    });
  };

  const onPlay = () => {
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(
        JSON.stringify({
          type: "command",
          action: "play",
          token: localStorage.getItem("token"),
        }),
      );
      return;
    }
    play();
  };

  const onPause = () => {
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(
        JSON.stringify({
          type: "command",
          action: "pause",
          token: localStorage.getItem("token"),
        }),
      );
      return;
    }
    pause();
  };

  const onNext = () => {
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(
        JSON.stringify({
          type: "command",
          action: "next",
          token: localStorage.getItem("token"),
        }),
      );
      return;
    }
    next();
  };

  const onPrevious = () => {
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(
        JSON.stringify({
          type: "command",
          action: "previous",
          token: localStorage.getItem("token"),
        }),
      );
      return;
    }
    previous();
  };

  const onSeek = (position: number) => {
    if (player === "rockbox" && socketRef.current) {
      socketRef.current.send(
        JSON.stringify({
          type: "command",
          action: "seek",
          token: localStorage.getItem("token"),
          args: {
            position,
          },
        }),
      );
      return;
    }
    seek(position);
  };

  const fetchCurrentlyPlaying = useCallback(async () => {
    if (player === "rockbox") {
      return;
    }
    const { data } = await axios.get(`${API_URL}/spotify/currently-playing`, {
      headers: {
        authorization: `Bearer ${localStorage.getItem("token")}`,
      },
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
    } else {
      if (player === "spotify") {
        setNowPlaying(null);
        setPlayer(null);
      }
    }
    lastFetchedRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNowPlaying, player]);

  const startProgressTracking = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    progressInterval.current = window.setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.duration) {
          return prev;
        }

        if (prev.progress >= prev.duration) {
          if (player === "spotify") {
            setTimeout(fetchCurrentlyPlaying, 2000);
          }
          return prev;
        }

        if (prev.isPlaying) {
          return {
            ...prev,
            progress: prev.progress + 100,
          };
        }

        return prev;
      });
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCurrentlyPlaying, setNowPlaying]);

  useEffect(() => {
    startProgressTracking();

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    playerRef.current = player;
    likedRef.current = liked;
  }, [nowPlaying, player, liked]);

  useEffect(() => {
    if (player === "rockbox") {
      return;
    }

    if (nowPlayingInterval.current) {
      clearInterval(nowPlayingInterval.current);
    }
    nowPlayingInterval.current = window.setInterval(() => {
      fetchCurrentlyPlaying();
    }, 15000);

    fetchCurrentlyPlaying();

    return () => {
      if (nowPlayingInterval.current) {
        clearInterval(nowPlayingInterval.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      return;
    }
    const ws = new WebSocket(`${API_URL.replace("http", "ws")}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "register",
          clientName: "rocksky",
          token: localStorage.getItem("token"),
        }),
      );

      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }

      heartbeatInterval.current = window.setInterval(() => {
        ws.send(
          JSON.stringify({
            type: "heartbeat",
            token: localStorage.getItem("token"),
          }),
        );
      }, 3000);

      ws.onmessage = (event) => {
        if (playerRef.current !== "rockbox" && playerRef.current !== null) {
          return;
        }

        const msg = JSON.parse(event.data);
        if (msg.type === "message" && msg.data?.type === "track") {
          if (
            lastFetchedRef.current &&
            Date.now() - lastFetchedRef.current < 3000
          ) {
            return;
          }

          if (
            nowPlayingRef.current !== null &&
            nowPlayingRef.current.isPlaying === undefined
          ) {
            return;
          }

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
            liked:
              likedRef.current[msg.data.song_uri] !== undefined
                ? likedRef.current[msg.data.song_uri]
                : msg.data.liked,
          });
          setPlayer("rockbox");
          lastFetchedRef.current = Date.now();
        }

        if (msg.data?.status === 0) {
          setNowPlaying(null);
        }

        if (msg.data?.status === 1 && nowPlayingRef.current) {
          setNowPlaying({
            ...nowPlayingRef.current,
            isPlaying: true,
          });
        }
        if (
          (msg.data?.status === 2 || msg.data?.status === 3) &&
          nowPlayingRef.current
        ) {
          setNowPlaying({
            ...nowPlayingRef.current,
            isPlaying: false,
          });
        }
      };

      console.log(">> WebSocket connection opened");
    };

    return () => {
      if (ws) {
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
        }
        ws.close();
      }
      console.log(">> WebSocket connection closed");
    };
  }, []);

  if (!nowPlaying) {
    return <></>;
  }

  return (
    <StickyPlayer
      nowPlaying={nowPlaying}
      onPlay={onPlay}
      onPause={onPause}
      onPrevious={onPrevious}
      onNext={onNext}
      onSpeaker={() => {}}
      onEqualizer={() => {}}
      onPlaylist={() => {}}
      onSeek={onSeek}
      isPlaying={nowPlaying.isPlaying}
      onLike={onLike}
      onDislike={onDislike}
    />
  );
}

export default StickyPlayerWithData;
