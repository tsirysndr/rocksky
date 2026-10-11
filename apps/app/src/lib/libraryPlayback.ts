import { getDefaultStore } from "jotai";
import { devicesAtom, selectedSourceAtom } from "../atoms/devices";
import { storage } from "../storage";
import { startProgressiveQueue } from "./progressiveQueue";
import { plyrTrack } from "../api/plyr";
import { mapConcurrent } from "./mapConcurrent";
import { remoteLibraries } from "../api/remoteLibraries";
import { remoteBridge } from "./remoteBridge";
import { Alert } from "react-native";
import type { UploadedTrack } from "../api/uploads";
import { castPlayback } from "./castPlayback";
import {
  isLocalEngineAvailable,
  localQueue,
  playUploads,
  queueUploadsLast,
  queueUploadsNext,
  type UploadQueueTrack,
} from "./uploadEngine";

export function uploadToQueueTrack(item: UploadedTrack): UploadQueueTrack {
  return {
    uploadId: item.upload.id,
    mimeType: item.upload.mimeType,
    title: item.track.title,
    artist: item.track.artist,
    albumArtist: item.track.albumArtist,
    album: item.track.album,
    albumArt: item.track.albumArt,
    durationMs: item.track.duration,
    songUri: item.track.uri,
    albumUri: item.track.albumUri,
    artistUri: item.track.artistUri,
    sha256: item.track.sha256,
  };
}

/** Resolve the library reference here; only the destination fetches and validates audio. */
export async function sendToSelectedPlayer(
  tracks: UploadQueueTrack[],
  mode: "now" | "next" | "last",
  startIndex = 0,
  current: () => boolean = () => true,
): Promise<boolean> {
  const target = remoteBridge.selectedTarget();
  if (!target) return false;
  const items = await Promise.all(
    tracks.map(async (track) => {
      if (track.localId)
        throw new Error(
          "Local files cannot be reached by the selected remote player.",
        );
      const url =
        track.audioUrl ||
        (track.remoteLibraryId && track.remoteTrackId
          ? await remoteLibraries.stream(
              track.remoteLibraryId,
              track.remoteTrackId,
            )
          : track.streamUrl);
      return {
        url,
        uploadId: url || track.navidromeId ? undefined : track.uploadId,
        trackId: url ? undefined : track.navidromeId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArtist: track.albumArtist,
        durationMs: track.durationMs,
        songUri: track.songUri ?? undefined,
        albumUri: track.albumUri ?? undefined,
      };
    }),
  );
  if (!current() || remoteBridge.selectedTarget() !== target) return false;
  remoteBridge.enqueue(target, items, mode, startIndex);
  return true;
}

async function resolvePlyrTracks(tracks: UploadQueueTrack[]) {
  return mapConcurrent(
    tracks,
    async (track) => {
      if (!track.plyrTrackId) return track;
      const { entry, url } = await plyrTrack(track.plyrTrackId);
      return {
        ...track,
        title: entry.title,
        artist: entry.artist,
        albumArtist: entry.artist,
        album: entry.album,
        albumArt: entry.art,
        durationMs: entry.durationMs,
        audioUrl: url,
        streamUrl: url,
      };
    },
    4,
  );
}

async function playQueueInternal(tracks: UploadQueueTrack[], index: number) {
  tracks = await resolvePlyrTracks(tracks);
  if (await sendToSelectedPlayer(tracks, "now", index)) return;
  if (!castPlayback.connected() && !isLocalEngineAvailable()) {
    Alert.alert(
      "Playback unavailable",
      "The native playback engine is not in this build. Rebuild the app with the Rust toolchain installed.",
    );
    return;
  }
  if (tracks.length === 0) return;
  const ok = await playUploads(tracks, index);
  if (!ok) {
    Alert.alert("Playback failed", "Could not start the playback engine.");
  }
}

export const playUploadedTracks = (tracks: UploadedTrack[], index: number) =>
  playQueue(tracks.map(uploadToQueueTrack), index);

async function queueTracksInternal(
  tracks: UploadQueueTrack[],
  where: "next" | "last",
) {
  tracks = await resolvePlyrTracks(tracks);
  if (await sendToSelectedPlayer(tracks, where)) return;
  if (!castPlayback.connected() && !isLocalEngineAvailable()) {
    Alert.alert(
      "Playback unavailable",
      "The native playback engine is not in this build. Rebuild the app with the Rust toolchain installed.",
    );
    return;
  }
  const ok =
    where === "next"
      ? await queueUploadsNext(tracks)
      : await queueUploadsLast(tracks);
  if (!ok) {
    Alert.alert("Queue failed", "Could not add that to the playback queue.");
  }
}

let playbackRequest = 0;

export async function playQueue(tracks: UploadQueueTrack[], index: number) {
  playbackRequest++;
  try {
    await playQueueInternal(tracks, index);
  } catch (error) {
    Alert.alert(
      "Playback rejected",
      error instanceof Error
        ? error.message
        : "The selected player could not play this track.",
    );
  }
}
export async function queueTracks(
  tracks: UploadQueueTrack[],
  where: "next" | "last",
) {
  try {
    await queueTracksInternal(tracks, where);
  } catch (error) {
    Alert.alert(
      "Queue rejected",
      error instanceof Error
        ? error.message
        : "The selected player could not queue this track.",
    );
  }
}

/** Play all/shuffle: commit the first track, then append validated tracks in order. */
export async function playQueueProgressively(tracks: UploadQueueTrack[]) {
  const request = ++playbackRequest;
  const token = storage.getToken();
  const cast = castPlayback.connected();
  const castGeneration = castPlayback.sessionGeneration();
  const store = getDefaultStore();
  let unsubscribe = () => {};
  let cancelled = false;
  try {
    const target = remoteBridge.selectedTarget();
    let anchor: UploadQueueTrack | undefined;
    const matches = (track: UploadQueueTrack) => {
      const queue = target ? store.get(devicesAtom)[target]?.queue : undefined;
      return (
        queue?.some((item) =>
          track.audioUrl
            ? item.url === track.audioUrl
            : track.navidromeId
              ? item.trackId === track.navidromeId
              : item.uploadId === track.uploadId,
        ) ?? false
      );
    };
    const current = () => {
      try {
        return (
          !cancelled &&
          request === playbackRequest &&
          storage.getToken() === token &&
          remoteBridge.selectedTarget() === target &&
          castPlayback.connected() === cast &&
          castPlayback.sessionGeneration() === castGeneration &&
          (!anchor ||
            (target ? matches(anchor) : localQueue().includes(anchor)))
        );
      } catch {
        return false;
      }
    };
    const send = async (track: UploadQueueTrack, mode: "now" | "last") => {
      const before = store.get(devicesAtom)[target!]?.queue;
      if (!(await sendToSelectedPlayer([track], mode, 0, current)))
        return false;
      const deadline = Date.now() + 45_000;
      while (current()) {
        if (store.get(devicesAtom)[target!]?.queue !== before && matches(track))
          return true;
        if (Date.now() >= deadline)
          throw new Error(
            "The selected player did not confirm this track. Check its connection.",
          );
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return false;
    };
    const { background } = await startProgressiveQueue(tracks, {
      current,
      resolve: async (item) => {
        const [track] = await resolvePlyrTracks([item]);
        if (target && track.remoteLibraryId && track.remoteTrackId) {
          return {
            ...track,
            audioUrl: await remoteLibraries.stream(
              track.remoteLibraryId,
              track.remoteTrackId,
            ),
          };
        }
        return track;
      },
      start: async (track) => {
        const ok = target
          ? await send(track, "now")
          : await playUploads([track], 0, current);
        if (ok) {
          anchor = track;
          const selected = store.get(selectedSourceAtom);
          unsubscribe = store.sub(selectedSourceAtom, () => {
            if (
              JSON.stringify(store.get(selectedSourceAtom)) !==
              JSON.stringify(selected)
            )
              cancelled = true;
          });
        }
        return ok;
      },
      append: async (track) => {
        const ok = target
          ? await send(track, "last")
          : await queueUploadsLast([track], current);
        if (ok) anchor = track;
        return ok;
      },
      skipped: (items) =>
        Alert.alert(
          "Some tracks were unavailable",
          `Skipped ${items.length} track${items.length === 1 ? "" : "s"} while loading the queue.`,
        ),
    });
    void background
      .finally(() => unsubscribe())
      .catch((error) => {
        if (current())
          Alert.alert(
            "Queue loading failed",
            error instanceof Error ? error.message : "Please try again.",
          );
      });
  } catch (error) {
    unsubscribe();
    if (request === playbackRequest)
      Alert.alert(
        "Playback rejected",
        error instanceof Error ? error.message : "Could not start playback.",
      );
  }
}
