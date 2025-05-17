import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import _ from "lodash";
import { useEffect } from "react";
import { nowPlayingAtom, progressAtom } from "../atoms/nowplaying";
import { API_URL } from "../consts";

export type NowPlayings = {
  id: string;
  title: string;
  artist: string;
  album_art: string;
  artist_uri?: string;
  album_uri?: string;
  uri: string;
  avatar: string;
  handle: string;
  did: string;
  created_at: string;
  track_id: string;
  track_uri: string;
}[];

export const useNowPlayingsQuery = () =>
  useQuery<NowPlayings>({
    queryKey: ["now-playings"],
    queryFn: () =>
      fetch(`${API_URL}/now-playings?size=7`, {
        method: "GET",
      }).then((res) => res.json()),
    refetchInterval: 5000,
  });

export const useNowPlaying = (did: string) => {
  const [progress, setProgress] = useAtom(progressAtom);
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);

  const nowPlayingResult = useQuery({
    queryKey: ["now-playing", did],
    queryFn: () =>
      fetch(`${API_URL}/now-playing?did=${did}`).then((res) => res.json()),
    refetchInterval: 3000,
    enabled: !!did,
    staleTime: 0,
  });
  const nowPlayingSpotifyResult = useQuery({
    queryKey: ["now-playing", "spotify", did],
    queryFn: () =>
      fetch(`${API_URL}/spotify/currently-playing?did=${did}`).then((res) =>
        res.json()
      ),
    refetchInterval: 3000,
    enabled: !!did,
    staleTime: 0,
  });

  useEffect(() => {
    if (
      !nowPlayingResult.isLoading &&
      nowPlayingResult.data &&
      Object.keys(nowPlayingResult.data).length
    ) {
      setNowPlaying({
        title: nowPlayingResult.data.title,
        artist:
          nowPlayingResult.data.album_artist || nowPlayingResult.data.artist,
        cover: nowPlayingResult.data.album_art,
        duration: nowPlayingResult.data.length,
        progress: nowPlayingResult.data.elapsed,
      });
      return;
    }

    if (!nowPlayingResult.isLoading && !nowPlayingResult.data) {
      setNowPlaying(null);
      return;
    }

    if (
      nowPlayingSpotifyResult.isLoading ||
      !nowPlayingSpotifyResult.data ||
      !Object.keys(nowPlayingSpotifyResult.data).length
    ) {
      return;
    }

    setNowPlaying({
      title: nowPlayingSpotifyResult.data.item.name,
      artist: nowPlayingSpotifyResult.data.item.artists
        .map((artist: { name: string }) => artist.name)
        .join(", "),
      cover: _.get(nowPlayingSpotifyResult.data, "item.album.images.0.url"),
      duration: nowPlayingSpotifyResult.data.item.duration_ms,
      progress: nowPlayingSpotifyResult.data.progress_ms,
    });
  }, [
    nowPlayingResult.data,
    nowPlayingSpotifyResult.data,
    nowPlayingResult.isLoading,
    nowPlayingSpotifyResult.isLoading,
  ]);

  // Sync progress with nowPlaying.progress from API
  useEffect(() => {
    if (nowPlaying) {
      setProgress(nowPlaying.progress);
    }
  }, [nowPlaying]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (nowPlaying) {
        setProgress((prev) => {
          if (prev >= nowPlaying.duration) {
            return nowPlaying.duration;
          }
          return prev + 500;
        });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [nowPlaying]);

  return {
    nowPlaying,
    progress,
    isLoading: nowPlayingResult.isLoading && nowPlayingSpotifyResult.isLoading,
  };
};
