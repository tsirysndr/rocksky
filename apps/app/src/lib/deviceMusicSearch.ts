import type { DeviceTrack } from "./deviceMusicModel";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

export function searchDeviceTracks(
  tracks: DeviceTrack[],
  query: string,
): DeviceTrack[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return tracks.filter((track) => {
    const text = normalize(
      [
        track.title,
        track.artist,
        track.albumArtist,
        track.album,
        track.genre,
        track.filename,
      ]
        .filter(Boolean)
        .join(" "),
    );
    return words.every((word) => text.includes(word));
  });
}
