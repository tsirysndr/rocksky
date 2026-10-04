import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import _ from "lodash";
import { useEffect, useRef } from "react";
import {
  localEngineActiveAtom,
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
  progressAtom,
} from "../atoms/nowplaying";
import { API_URL } from "../consts";

// `paused`: an active remote device is feeding the now-playing atoms over the
// WebSocket, so the polling fallback must not write (or clear) them.
export const useNowPlaying = (did: string, paused = false) => {
  const localActive = useAtomValue(localEngineActiveAtom);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [progress, setProgress] = useAtom(progressAtom);
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const [, setPlayer] = useAtom(playerAtom);
  const [lockedUntil] = useAtom(playbackLockedUntilAtom);
  const lockedUntilRef = useRef(lockedUntil);
  const nowPlayingRef = useRef(nowPlaying);

  useEffect(() => {
    lockedUntilRef.current = lockedUntil;
  }, [lockedUntil]);
  const progressRef = useRef(progress);

  const nowPlayingResult = useQuery({
    queryKey: ["now-playing", did],
    queryFn: () =>
      fetch(`${API_URL}/now-playing?did=${did}`)
        .then((res) => res.json())
        .catch(() => null),
    refetchInterval: 15000,
    enabled: !!did,
    staleTime: 0,
  });
  const nowPlayingSpotifyResult = useQuery({
    queryKey: ["now-playing", "spotify", did],
    queryFn: () =>
      fetch(`${API_URL}/spotify/currently-playing?did=${did}`)
        .then((res) => res.json())
        .catch(() => null),
    refetchInterval: 15000,
    enabled: !!did,
    staleTime: 0,
  });

  useEffect(() => {
    if (paused) return;

    const rockbox = nowPlayingResult.data;
    const spotify = nowPlayingSpotifyResult.data;
    const rockboxValid =
      !nowPlayingResult.isLoading && rockbox && rockbox.title;
    const spotifyValid =
      !nowPlayingSpotifyResult.isLoading && spotify && spotify.item;

    if (rockboxValid) {
      const locked = Date.now() < lockedUntilRef.current;
      setNowPlaying((prev) => ({
        title: rockbox.title,
        artist: rockbox.album_artist || rockbox.artist,
        cover: rockbox.album_art,
        duration: rockbox.length,
        progress: rockbox.elapsed,
        isPlaying: locked && prev ? prev.isPlaying : rockbox.is_playing,
        liked: rockbox.liked,
        uri: rockbox.songUri,
        album: rockbox.album,
        artistUri: rockbox.artist_uri,
        albumUri: rockbox.album_uri,
      }));
      setPlayer("rockbox");
      setProgress(rockbox.elapsed);
      progressRef.current = rockbox.elapsed;
      return;
    }

    if (spotifyValid) {
      const locked = Date.now() < lockedUntilRef.current;
      setNowPlaying((prev) => ({
        title: spotify.item.name,
        artist: spotify.item.artists
          .map((artist: { name: string }) => artist.name)
          .join(", "),
        cover: _.get(spotify, "item.album.images.0.url"),
        duration: spotify.item.duration_ms,
        progress: spotify.progress_ms,
        isPlaying: locked && prev ? prev.isPlaying : spotify.is_playing,
        liked: spotify.liked,
        uri: spotify.songUri,
        artistUri: spotify.artistUri,
        albumUri: spotify.albumUri,
      }));
      setPlayer("spotify");
      setProgress(spotify.progress_ms);
      progressRef.current = spotify.progress_ms;
      return;
    }

    // Clear only once both sources have answered and neither is playing.
    if (!nowPlayingResult.isLoading && !nowPlayingSpotifyResult.isLoading) {
      setNowPlaying(null);
      setPlayer(null);
    }
  }, [
    paused,
    nowPlayingResult.data,
    nowPlayingSpotifyResult.data,
    nowPlayingResult.isLoading,
    nowPlayingSpotifyResult.isLoading,
    setNowPlaying,
    setPlayer,
    setProgress,
  ]);

  // The native engine is the sole position authority for local playback.
  // Remote sources interpolate forward between reports; paused playback never
  // writes an old ref back over a seek or an authoritative player update.
  useEffect(() => {
    if (localActive) return;
    let lastTick = Date.now();
    progressInterval.current = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      const track = nowPlayingRef.current;
      if (!track?.isPlaying) return;
      setProgress((value) =>
        Math.min(track.duration || Infinity, value + delta),
      );
    }, 100);
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [localActive, setProgress]);

  useEffect(() => {
    if (nowPlaying) {
      nowPlayingRef.current = nowPlaying;
    } else {
      nowPlayingRef.current = null;
    }
  }, [nowPlaying]);

  return {
    nowPlaying,
    progress,
    isLoading: nowPlayingResult.isLoading && nowPlayingSpotifyResult.isLoading,
  };
};
