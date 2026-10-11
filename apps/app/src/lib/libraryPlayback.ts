import { plyrTrack } from "../api/plyr";
import { mapConcurrent } from "./mapConcurrent";
import { remoteLibraries } from "../api/remoteLibraries";
import { remoteBridge } from "./remoteBridge";
import { Alert } from "react-native";
import type { UploadedTrack } from "../api/uploads";
import { castPlayback } from "./castPlayback";
import {
  isLocalEngineAvailable,
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

export async function playQueue(tracks: UploadQueueTrack[], index: number) {
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
