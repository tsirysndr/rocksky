import axios from "axios";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  userNowPlayingAtom,
  type UserNowPlaying,
} from "../atoms/userNowplaying";
import { API_URL } from "../consts";

export const SPOTIFY_SOURCE = "Spotify";

// Matches the 3s TTL the remote now-playing blob is written with: polling any
// slower than the data changes makes play/pause detection lag badly.
const POLL_MS = 3000;
const TICK_MS = 250;

/** `GET /now-playing` — the profile owner's active remote device. */
type RemoteNowPlaying = {
  title?: string;
  artist?: string;
  album_artist?: string;
  artist_uri?: string;
  song_uri?: string;
  album_uri?: string;
  album_art?: string;
  length?: number;
  elapsed?: number;
  is_playing?: boolean;
  liked?: boolean;
  device_name?: string | null;
};

/** `GET /spotify/currently-playing` — Spotify's payload plus Rocksky's URIs. */
type SpotifyNowPlaying = {
  item?: {
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album?: { images?: { url: string }[] };
  };
  progress_ms?: number;
  is_playing?: boolean;
  liked?: boolean;
  songUri?: string;
  artistUri?: string;
  albumUri?: string;
};

const fetchSource = async <T>(path: string, did: string): Promise<T> => {
  try {
    const { data } = await axios.get<T>(`${API_URL}${path}`, {
      headers: {
        authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      params: { did },
    });
    return data || ({} as T);
  } catch {
    // A source the profile owner doesn't use answers 401 (no linked account).
    // It must not take the other source down with it.
    return {} as T;
  }
};

const remoteCandidate = (
  data: RemoteNowPlaying,
  sampledAt: number,
): UserNowPlaying | null =>
  data.title
    ? {
        title: data.title,
        artist: data.album_artist || data.artist || "",
        artistUri: data.artist_uri || "",
        songUri: data.song_uri || "",
        albumUri: data.album_uri || "",
        duration: data.length || 0,
        progress: data.elapsed || 0,
        sampledAt,
        albumArt: data.album_art,
        isPlaying: !!data.is_playing,
        liked: !!data.liked,
        source: data.device_name || null,
      }
    : null;

const spotifyCandidate = (
  data: SpotifyNowPlaying,
  sampledAt: number,
): UserNowPlaying | null =>
  data.item
    ? {
        title: data.item.name,
        artist: data.item.artists[0]?.name || "",
        artistUri: data.artistUri || "",
        songUri: data.songUri || "",
        albumUri: data.albumUri || "",
        duration: data.item.duration_ms,
        progress: data.progress_ms || 0,
        sampledAt,
        albumArt: data.item.album?.images?.[0]?.url,
        isPlaying: !!data.is_playing,
        liked: !!data.liked,
        source: SPOTIFY_SOURCE,
      }
    : null;

// Both sources report their own transport state, so "active" is simply the one
// that is playing: a paused source only wins when nothing else is running.
const activity = (candidate: UserNowPlaying | null) => {
  if (!candidate || !candidate.duration) return 0;
  return candidate.isPlaying ? 2 : 1;
};

// The remote blob lives on a 3s TTL and a push can just miss the window, so one
// empty answer isn't proof playback ended.
const MISSES_BEFORE_CLEARED = 2;

export const livePosition = (entry: UserNowPlaying | null) => {
  if (!entry) return 0;
  const elapsed = entry.isPlaying ? Date.now() - entry.sampledAt : 0;
  return Math.min(entry.progress + elapsed, entry.duration);
};

/**
 * Polls every player a user could be listening on and keeps the one that is
 * actually active — playing, with a position that moves. Returns the winning
 * track plus its extrapolated position, so callers don't run their own timers.
 */
export function useUserNowPlaying(did?: string) {
  const [nowPlaying, setNowPlaying] = useAtom(userNowPlayingAtom);
  const misses = useRef(0);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!did) return;

    // Always ask both sources. Which player the *viewer* selected says nothing
    // about what the profile owner is listening on.
    const [remoteData, spotifyData] = await Promise.all([
      fetchSource<RemoteNowPlaying>("/now-playing", did),
      fetchSource<SpotifyNowPlaying>("/spotify/currently-playing", did),
    ]);

    const sampledAt = Date.now();
    const remote = remoteCandidate(remoteData, sampledAt);
    const spotify = spotifyCandidate(spotifyData, sampledAt);

    // Ties go to the remote device: it is the one the owner explicitly made
    // primary, whereas Spotify's cached state lingers after playback moved away.
    const next = activity(remote) >= activity(spotify) ? remote : spotify;

    if (!next) {
      misses.current += 1;
      if (misses.current < MISSES_BEFORE_CLEARED) return;
    } else {
      misses.current = 0;
    }

    setNowPlaying((prev) => ({ ...prev, [did]: next }));
  }, [did, setNowPlaying]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!did) return;
    refresh();
    const id = window.setInterval(() => refreshRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, [did, refresh]);

  const entry = (did ? nowPlaying[did] : null) || null;
  const entryRef = useRef(entry);
  entryRef.current = entry;

  // One ticker drives the extrapolated position for every consumer: the value is
  // derived from `sampledAt`, so mounting this hook twice can't double-count.
  useEffect(() => {
    const endRefetch = { scheduled: false };
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      const current = entryRef.current;
      if (
        current?.duration &&
        current.isPlaying &&
        !endRefetch.scheduled &&
        livePosition(current) >= current.duration
      ) {
        // The track ran out: the source has almost certainly moved on, so
        // resample instead of sitting pinned at 100% until the next poll.
        endRefetch.scheduled = true;
        window.setTimeout(() => {
          endRefetch.scheduled = false;
          refreshRef.current();
        }, 2000);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return { nowPlaying: entry, progress: livePosition(entry), refresh };
}

export default useUserNowPlaying;
