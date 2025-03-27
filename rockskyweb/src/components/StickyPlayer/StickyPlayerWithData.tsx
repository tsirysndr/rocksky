import axios from "axios";
import { useAtom } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef } from "react";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { API_URL } from "../../consts";
import useLike from "../../hooks/useLike";
import useSpotify from "../../hooks/useSpotify";
import StickyPlayer from "./StrickyPlayer";

function StickyPlayerWithData() {
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const progressInterval = useRef<number | null>(null);
  const lastFetchedRef = useRef(0);
  const nowPlayingInterval = useRef<number | null>(null);
  const { play, pause, next, previous, seek } = useSpotify();
  const { like, unlike } = useLike();

  const onLike = (uri: string) => {
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

  const fetchCurrentlyPlaying = useCallback(async () => {
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
        liked: data.liked,
      });
    } else {
      setNowPlaying(null);
    }
    lastFetchedRef.current = Date.now();
  }, [setNowPlaying]);

  const startProgressTracking = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    progressInterval.current = setInterval(() => {
      setNowPlaying((prev) => {
        if (!prev || !prev.duration) {
          return prev;
        }

        if (prev.progress >= prev.duration) {
          setTimeout(fetchCurrentlyPlaying, 2000);
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
    if (nowPlayingInterval.current) {
      clearInterval(nowPlayingInterval.current);
    }
    nowPlayingInterval.current = setInterval(() => {
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

  if (!nowPlaying) {
    return <></>;
  }

  return (
    <StickyPlayer
      nowPlaying={nowPlaying}
      onPlay={play}
      onPause={pause}
      onPrevious={previous}
      onNext={next}
      onSpeaker={() => {}}
      onEqualizer={() => {}}
      onPlaylist={() => {}}
      onSeek={seek}
      isPlaying={nowPlaying.isPlaying}
      onLike={onLike}
      onDislike={onDislike}
    />
  );
}

export default StickyPlayerWithData;
