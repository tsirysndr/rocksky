import type { PickedAudioFile } from "../api/uploads";
import { completeDeviceMetadata, type DeviceTrack } from "./deviceMusicModel";

const mimeTypes: Record<string, string> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  aif: "audio/aiff",
  aiff: "audio/aiff",
};
const mimeType = (track: DeviceTrack) =>
  mimeTypes[track.filename.split(".").at(-1)?.toLowerCase() ?? ""];

export function localUploadDisabledReason(
  tracks: DeviceTrack[],
): string | null {
  if (!tracks.length) return "No local tracks are available.";
  const incomplete = tracks.filter(
    (track) => !completeDeviceMetadata(track),
  ).length;
  if (incomplete)
    return tracks.length === 1
      ? "Complete this track’s metadata before uploading."
      : `Complete metadata for all album tracks before uploading (${incomplete} incomplete).`;
  if (tracks.some((track) => !mimeType(track)))
    return "This selection contains an audio format that uploads do not support.";
  return null;
}

export function localUploadFiles(tracks: DeviceTrack[]): PickedAudioFile[] {
  const reason = localUploadDisabledReason(tracks);
  if (reason) throw new Error(reason);
  return [...new Map(tracks.map((track) => [track.id, track])).values()].map(
    (track) => ({
      uri: track.uri,
      name: track.filename,
      mimeType: mimeType(track),
      localTrackId: track.id,
    }),
  );
}
