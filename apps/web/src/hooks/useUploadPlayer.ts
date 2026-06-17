import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { profileAtom } from "../atoms/profile";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";
import { ensureStreamToken, getStreamUrl } from "../api/uploads";
import { insertTracks, startPlaylist, playTrack } from "../lib/rockbox-graphql";
import { hlsAudio } from "../lib/hls-audio";
import { ROCKBOX_URL } from "../consts";

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
  const [queue, setQueue] = [useAtomValue(queueAtom), useSetAtom(queueAtom)];
  const [queueIndex, setQueueIndex] = [useAtomValue(queueIndexAtom), useSetAtom(queueIndexAtom)];
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);
  const profile = useAtomValue(profileAtom);

  const did = profile?.did ?? "";
  const hlsUrl = did ? `${ROCKBOX_URL}/${did}/hls/audio.m3u8` : "";

  const playNow = useCallback(
    async (tracks: QueueTrack[], startIndex = 0) => {
      if (!did) return;
      setQueue(tracks);
      setQueueIndex(startIndex);
      setNowPlaying(trackToNowPlaying(tracks[startIndex]));
      setPlayer("rockbox");
      hlsAudio.attach(hlsUrl);

      await ensureStreamToken();

      // Play the starting track immediately, then enqueue the rest one by one.
      // Rockbox backend can't handle multiple files in one request.
      const startUrl = getStreamUrl(tracks[startIndex].uploadId);
      await playTrack(did, startUrl).catch(console.warn);

      // Enqueue tracks after startIndex, then tracks before startIndex (wrap-around)
      const after = tracks.slice(startIndex + 1);
      const before = tracks.slice(0, startIndex);
      for (const track of [...after, ...before]) {
        await insertTracks(did, [getStreamUrl(track.uploadId)], -1).catch(console.warn);
      }
    },
    [did, hlsUrl, setQueue, setQueueIndex, setNowPlaying, setPlayer],
  );

  const playNext = useCallback(
    async (track: QueueTrack) => {
      if (!did) return;
      setQueue((prev) => {
        const next = [...prev];
        next.splice(queueIndex + 1, 0, track);
        return next;
      });
      await ensureStreamToken();
      await insertTracks(did, [getStreamUrl(track.uploadId)], 1).catch(console.warn);
    },
    [did, setQueue, queueIndex],
  );

  const playNextAll = useCallback(
    async (tracks: QueueTrack[]) => {
      if (!did) return;
      setQueue((prev) => {
        const next = [...prev];
        next.splice(queueIndex + 1, 0, ...tracks);
        return next;
      });
      await ensureStreamToken();
      for (const track of tracks) {
        await insertTracks(did, [getStreamUrl(track.uploadId)], 1).catch(console.warn);
      }
    },
    [did, setQueue, queueIndex],
  );

  const playLast = useCallback(
    async (track: QueueTrack) => {
      if (!did) return;
      setQueue((prev) => [...prev, track]);
      await ensureStreamToken();
      await insertTracks(did, [getStreamUrl(track.uploadId)], -1).catch(console.warn);
    },
    [did, setQueue],
  );

  const playLastAll = useCallback(
    async (tracks: QueueTrack[]) => {
      if (!did) return;
      setQueue((prev) => [...prev, ...tracks]);
      await ensureStreamToken();
      for (const track of tracks) {
        await insertTracks(did, [getStreamUrl(track.uploadId)], -1).catch(console.warn);
      }
    },
    [did, setQueue],
  );

  return { queue, queueIndex, playNow, playNext, playNextAll, playLast, playLastAll };
}
