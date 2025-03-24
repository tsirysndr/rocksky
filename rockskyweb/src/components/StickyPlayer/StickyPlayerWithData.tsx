import axios from "axios";
import { useAtom } from "jotai";
import _ from "lodash";
import { useCallback, useEffect, useRef } from "react";
import { nowPlayingAtom } from "../../atoms/nowpaying";
import { API_URL } from "../../consts";
import StickyPlayer from "./StrickyPlayer";

function StickyPlayerWithData() {
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const progressInterval = useRef<number | null>(null);
  const lastFetchedRef = useRef(0);

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
        duration: data.item.duration_ms,
        progress: data.progress_ms,
        albumArt: _.get(data, "item.album.images.0.url"),
        isPlaying: data.is_playing,
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
      if (!nowPlaying || !nowPlaying.duration) {
        return;
      }

      if (nowPlaying.progress >= nowPlaying.duration) {
        fetchCurrentlyPlaying();
        return;
      }

      if (nowPlaying.isPlaying) {
        setNowPlaying((prev) => {
          if (prev) {
            return {
              ...prev,
              progress: prev.progress + 100,
            };
          }
          return prev;
        });
      }
    }, 100);

    // Fetch currently playing every 10 seconds
    if (Date.now() - lastFetchedRef.current > 10000) {
      fetchCurrentlyPlaying();
    }
  }, [fetchCurrentlyPlaying, nowPlaying, setNowPlaying]);

  useEffect(() => {
    startProgressTracking();

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [startProgressTracking]);

  useEffect(() => {
    fetchCurrentlyPlaying();
  }, [fetchCurrentlyPlaying]);

  if (!nowPlaying) {
    return <></>;
  }

  return (
    <StickyPlayer
      nowPlaying={nowPlaying}
      onPlay={() => {}}
      onPause={() => {}}
      onPrevious={() => {}}
      onNext={() => {}}
      onSpeaker={() => {}}
      onEqualizer={() => {}}
      onPlaylist={() => {}}
      onSeek={() => {}}
      isPlaying={nowPlaying.isPlaying}
    />
  );
}

export default StickyPlayerWithData;
