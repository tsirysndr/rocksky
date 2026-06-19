import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { profileAtom } from "../atoms/profile";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";
import { ensureStreamToken, getStreamUrl } from "../api/uploads";
import {
  PLAYLIST_INSERT_FIRST,
  PLAYLIST_INSERT_LAST,
  getCurrentPlaylist,
  insertTracks,
  playTrack,
} from "../lib/rockbox-graphql";
import { hlsAudio } from "../lib/hls-audio";
import { ROCKBOX_URL } from "../consts";

// useUploadPlayer — thin orchestrator around rockbox playlist mutations.
//
// IMPORTANT: rockbox is the ONLY source of truth for the queue. This hook
// does NOT mutate queueAtom or queueIndexAtom locally — it calls the rockbox
// GraphQL mutations, then refetches `playlistGetCurrent` and writes the
// result into the atoms. The queue UI (QueuePanel) reads those atoms and
// always reflects rockbox's view.
//
// Why no local optimistic update?
//   - The previous code did setQueue(...) THEN insertTracks(...). The local
//     splice index never matched rockbox's internal playlist position
//     (rockbox uses signed PLAYLIST_INSERT_* constants for "play next" /
//     "play last", not literal array indices). Result: the UI showed one
//     order, rockbox played another, and the 5s background poll would
//     eventually clobber the optimistic update with rockbox's reality.
//   - StickyPlayerWithData also polls `playlistGetCurrent` every 5s, so any
//     race with the local atom would surface on the next tick anyway.
//
// Position constants (apps/playlist.h in rockbox firmware):
//   PLAYLIST_INSERT_FIRST = -4   → insert AFTER current track  ("play next")
//   PLAYLIST_INSERT_LAST  = -3   → append at end               ("play last")
//   Anything ≥ 0 means a LITERAL index — almost never what you want here.

function trackToNowPlaying(track: QueueTrack, isPlaying = true) {
  return {
    title: track.title,
    artist: track.artist,
    artistUri: "",
    songUri: track.songUri ?? "",
    albumUri: "",
    duration: track.duration,
    progress: 0,
    albumArt: track.albumArt ?? undefined,
    isPlaying,
    sha256: track.sha256,
    liked: false,
  };
}

export function useUploadPlayer() {
  const queue = useAtomValue(queueAtom);
  const queueIndex = useAtomValue(queueIndexAtom);
  const setQueue = useSetAtom(queueAtom);
  const setQueueIndex = useSetAtom(queueIndexAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);
  const profile = useAtomValue(profileAtom);

  const did = profile?.did ?? "";
  const hlsUrl = did ? `${ROCKBOX_URL}/${did}/hls/audio.m3u8` : "";

  // Refresh queueAtom from rockbox's authoritative state. Called after every
  // playlist mutation so the UI converges to rockbox's view within one round
  // trip instead of waiting for the next background poll.
  const refreshQueue = useCallback(async () => {
    if (!did) return;
    try {
      const pl = await getCurrentPlaylist(did);
      if (!pl) return;
      setQueueIndex(pl.index);
      setQueue(
        pl.tracks.map((t) => ({
          uploadId: t.id,
          title: t.title,
          artist: t.artist,
          albumArtist: t.artist,
          album: t.album,
          albumArt: t.albumArt
            ? t.albumArt.startsWith("http")
              ? t.albumArt
              : `${ROCKBOX_URL}/${did}/covers/${t.albumArt}`
            : null,
          duration: t.length,
          sha256: "",
          songUri: t.path,
          streamUrl: t.path,
        })),
      );
    } catch (e) {
      console.warn("[useUploadPlayer] refreshQueue failed:", e);
    }
  }, [did, setQueue, setQueueIndex]);

  const playNow = useCallback(
    async (tracks: QueueTrack[], startIndex = 0) => {
      if (!did) return;
      // For "play now" we DO update the now-playing optimistically so the
      // sticky player shows the new track instantly — queue position will be
      // reconciled by refreshQueue once rockbox confirms.
      setNowPlaying(trackToNowPlaying(tracks[startIndex]));
      setPlayer("rockbox");
      hlsAudio.attach(hlsUrl);

      await ensureStreamToken();

      // playTrack creates a fresh playlist with this single track and starts
      // playback. Then enqueue the rest using PLAYLIST_INSERT_LAST so they
      // append in order. Rockbox can't accept multiple files in one request,
      // so we loop.
      const startUrl =
        tracks[startIndex].streamUrl ?? getStreamUrl(tracks[startIndex].uploadId);
      await playTrack(did, startUrl).catch(console.warn);

      const after = tracks.slice(startIndex + 1);
      const before = tracks.slice(0, startIndex);
      for (const track of [...after, ...before]) {
        await insertTracks(
          did,
          [track.streamUrl ?? getStreamUrl(track.uploadId)],
          PLAYLIST_INSERT_LAST,
        ).catch(console.warn);
      }

      await refreshQueue();
    },
    [did, hlsUrl, setNowPlaying, setPlayer, refreshQueue],
  );

  const playNext = useCallback(
    async (track: QueueTrack) => {
      if (!did) return;
      await ensureStreamToken();
      await insertTracks(
        did,
        [track.streamUrl ?? getStreamUrl(track.uploadId)],
        PLAYLIST_INSERT_FIRST, // ← was 1 (literal index), now correctly "after current"
      ).catch(console.warn);
      await refreshQueue();
    },
    [did, refreshQueue],
  );

  const playNextAll = useCallback(
    async (tracks: QueueTrack[]) => {
      if (!did) return;
      await ensureStreamToken();
      // Reverse-iterate: each insert pushes the previous "next" down by one,
      // so to preserve the user's intended order we insert the LAST track
      // first. After N inserts, the list is [current, t0, t1, ..., tN].
      for (const track of [...tracks].reverse()) {
        await insertTracks(
          did,
          [track.streamUrl ?? getStreamUrl(track.uploadId)],
          PLAYLIST_INSERT_FIRST,
        ).catch(console.warn);
      }
      await refreshQueue();
    },
    [did, refreshQueue],
  );

  const playLast = useCallback(
    async (track: QueueTrack) => {
      if (!did) return;
      await ensureStreamToken();
      await insertTracks(
        did,
        [track.streamUrl ?? getStreamUrl(track.uploadId)],
        PLAYLIST_INSERT_LAST, // ← was -1 (== PLAYLIST_PREPEND, wrong end!), now appends
      ).catch(console.warn);
      await refreshQueue();
    },
    [did, refreshQueue],
  );

  const playLastAll = useCallback(
    async (tracks: QueueTrack[]) => {
      if (!did) return;
      await ensureStreamToken();
      for (const track of tracks) {
        await insertTracks(
          did,
          [track.streamUrl ?? getStreamUrl(track.uploadId)],
          PLAYLIST_INSERT_LAST,
        ).catch(console.warn);
      }
      await refreshQueue();
    },
    [did, refreshQueue],
  );

  return {
    queue,
    queueIndex,
    playNow,
    playNext,
    playNextAll,
    playLast,
    playLastAll,
    refreshQueue,
  };
}
