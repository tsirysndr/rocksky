export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  source: "local" | "uploaded";
};
export type Phase = "idle" | "playing" | "paused" | "loading" | "error";
export type ReceiverState = {
  phase: Phase;
  track: Track | null;
  position: number;
  duration: number;
  queue: Track[];
  queueCount?: number;
  volume: number;
  error?: string;
};
export const idleState: ReceiverState = {
  phase: "idle",
  track: null,
  position: 0,
  duration: 0,
  queue: [],
  volume: 1,
};
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown, fallback = "") =>
  typeof v === "string" && v.trim() ? v : fallback;
export const finite = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
export function artworkUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value, "https://receiver.rocksky.app");
    return ["http:", "https:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}
export function readTrack(value: unknown): Track | null {
  const media = record(value);
  const metadata = record(media.metadata);
  if (!Object.keys(metadata).length) return null;
  const images = Array.isArray(metadata.images) ? metadata.images : [];
  const custom = record(record(media.customData).rocksky);
  return {
    id: text(media.contentId, text(media.contentUrl, text(metadata.title))),
    title: text(metadata.title, "Untitled track"),
    artist: text(metadata.artist, text(metadata.albumArtist, "Unknown artist")),
    album: text(metadata.albumName, text(metadata.albumTitle, "Unknown album")),
    artwork: artworkUrl(record(images[0]).url),
    duration: finite(media.duration, finite(media.streamDuration)),
    source: custom.source === "local" ? "local" : "uploaded",
  };
}
export function snapshot(input: {
  playerState: string;
  media: unknown;
  position: number;
  duration: number;
  items: unknown[];
  index: number;
  volume?: number;
}): ReceiverState {
  const track = readTrack(input.media);
  const phase: Phase =
    input.playerState === "PLAYING"
      ? "playing"
      : input.playerState === "PAUSED"
        ? "paused"
        : ["BUFFERING", "LOADING"].includes(input.playerState)
          ? "loading"
          : "idle";
  const { position, duration } = playbackTime(
    input.position,
    input.duration,
    track?.duration || 0,
  );
  return {
    phase,
    track: phase === "idle" ? null : track,
    position: phase === "idle" ? 0 : position,
    duration,
    queue: input.items
      .slice(Math.max(0, input.index + 1))
      .map((item) => {
        const q = record(item);
        return readTrack(q.media ?? q.mediaInfo);
      })
      .filter((t): t is Track => !!t),
    volume: Math.min(1, finite(input.volume, 1)),
  };
}
export function clock(seconds: number): string {
  const s = Math.floor(finite(seconds));
  const hours = Math.floor(s / 3600);
  return hours
    ? `${hours}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** CAF reports seconds. A zero/unknown player duration must not erase sender metadata. */
export function playbackTime(
  position: number,
  measuredDuration: number,
  metadataDuration: number,
) {
  const duration = finite(measuredDuration) || finite(metadataDuration);
  return {
    position: Math.floor(Math.min(finite(position), duration || Infinity)),
    duration,
  };
}
