import { Alert } from "react-native";
import type { UploadedTrack } from "../api/uploads";
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

export async function playQueue(tracks: UploadQueueTrack[], index: number) {
  if (!isLocalEngineAvailable()) {
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

export async function queueTracks(
  tracks: UploadQueueTrack[],
  where: "next" | "last",
) {
  if (!isLocalEngineAvailable()) {
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
