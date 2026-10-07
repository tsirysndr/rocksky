import type { UploadQueueTrack } from "./uploadEngine";

export type DeviceTrack = {
  id: string;
  uri: string;
  filename: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  albumArt?: string | null;
  durationMs: number;
  genre?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  mbId?: string;
  tags?: Record<string, string[]>;
  favorite: boolean;
  edited: boolean;
};
export type DevicePlaylist = { id: string; name: string; trackIds: string[] };
export type DeviceLibrary = {
  tracks: DeviceTrack[];
  playlists: DevicePlaylist[];
  scan: {
    state: string;
    count: number;
    permission: boolean;
    error?: string;
    rescanQueued?: boolean;
  };
};

export function completeDeviceMetadata(
  track: Pick<
    DeviceTrack,
    "title" | "artist" | "album" | "albumArtist" | "durationMs"
  >,
): boolean {
  const valid = (value: string | undefined, max: number) => {
    const text = value?.trim() ?? "";
    return (
      text.length > 0 &&
      [...text].length <= max &&
      !/^(<unknown>|unknown(?: artist| album| title)?|untitled)$/i.test(text)
    );
  };
  return (
    valid(track.title, 512) &&
    valid(track.artist, 256) &&
    valid(track.album, 256) &&
    (!track.albumArtist || valid(track.albumArtist, 256)) &&
    Number.isFinite(track.durationMs) &&
    track.durationMs > 0
  );
}

export function deviceQueueTrack(track: DeviceTrack): UploadQueueTrack {
  return {
    uploadId: `device:${track.id}`,
    localId: track.id,
    title: track.title?.trim() || track.filename,
    artist: track.artist?.trim() || "Unknown artist",
    album: track.album?.trim() || "Unknown album",
    albumArtist: track.albumArtist?.trim() || track.artist?.trim() || "",
    albumArt: track.albumArt ?? null,
    durationMs: track.durationMs,
    songUri: null,
    artistUri: null,
    albumUri: null,
    sha256: "",
    liked: track.favorite,
    mbId: track.mbId,
    scrobbleEligible: completeDeviceMetadata(track),
  };
}
