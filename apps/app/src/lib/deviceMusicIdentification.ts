import { localMusicNative } from "../../modules/rocksky-engine";
import Constants from "expo-constants";
import type { DeviceTrack } from "./deviceMusic";
import { checkCancelled, createMetadataRequester } from "./metadataRequests";
import { API_URL } from "../consts";

export type MetadataSuggestion = {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  mbId: string;
  year?: number;
  source: "AcoustID" | "MusicBrainz" | "Rocksky";
  score?: number;
  releaseId?: string;
  albumArt?: string;
  genre?: string;
  trackNumber?: number;
  discNumber?: number;
  enrichmentWarning?: string;
};
let identifying = false;
const json = createMetadataRequester({
  userAgent: () =>
    `Rocksky/${Constants.expoConfig?.version ?? "unknown"} (https://rocksky.app)`,
});

type Credit = { name?: string; artist?: { name: string }; joinphrase?: string };
type Recording = {
  id: string;
  title: string;
  score?: number;
  "artist-credit"?: Credit[];
  releases?: {
    id?: string;
    title: string;
    date?: string;
    "artist-credit"?: Credit[];
  }[];
};
const artistName = (credits?: Credit[]) =>
  credits
    ?.map((c) => `${c.name ?? c.artist?.name ?? ""}${c.joinphrase ?? ""}`)
    .join("") ?? "";
function suggestions(
  recording: Recording,
  source: MetadataSuggestion["source"],
  score?: number,
): MetadataSuggestion[] {
  return (
    recording.releases?.length
      ? recording.releases.slice(0, 12)
      : [{ title: "" }]
  ).map((release) => ({
    title: recording.title,
    artist: artistName(recording["artist-credit"]),
    album: release.title,
    albumArtist:
      artistName(release["artist-credit"]) ||
      artistName(recording["artist-credit"]),
    mbId: recording.id,
    releaseId: release.id,
    year: release.date
      ? Number(release.date.slice(0, 4)) || undefined
      : undefined,
    source,
    score,
  }));
}

const normalized = (value?: string) => value?.trim().toLocaleLowerCase() ?? "";
const imageUrl = (value: unknown): string | undefined =>
  typeof value === "string" && /^https?:\/\//.test(value)
    ? value.replace(/^http:/, "https:")
    : undefined;

/** Enrich only the release the user chooses, avoiding requests for every candidate. */
export async function enrichMetadataSuggestion(
  candidate: MetadataSuggestion,
  signal?: AbortSignal,
): Promise<MetadataSuggestion> {
  const result = { ...candidate };
  const warnings: string[] = [];
  if (!candidate.title.trim() || !candidate.artist.trim())
    throw new Error("Enter a title and artist to find additional metadata.");
  try {
    const params = new URLSearchParams({
      title: candidate.title,
      artist: candidate.artist,
    });
    if (candidate.album) params.set("album", candidate.album);
    if (candidate.mbId) params.set("mbId", candidate.mbId);
    const match = await json(
      `${API_URL}/xrpc/app.rocksky.song.matchSong?${params}`,
      {},
      signal,
    );
    const sameRecording =
      (candidate.mbId && candidate.mbId === match.mbid) ||
      (normalized(candidate.title) === normalized(match.title) &&
        normalized(candidate.artist) === normalized(match.artist));
    const sameAlbum =
      !candidate.album ||
      normalized(candidate.album) === normalized(match.album);
    if (sameRecording && sameAlbum) {
      result.album ||= match.album || "";
      result.albumArtist = match.albumArtist || result.albumArtist;
      result.mbId ||= match.mbid || "";
      result.albumArt = imageUrl(match.albumArt) || result.albumArt;
      result.genre =
        typeof match.genre === "string"
          ? match.genre
          : Array.isArray(match.genres)
            ? match.genres
                .filter((g: unknown) => typeof g === "string")
                .join("; ")
            : result.genre;
      for (const field of ["year", "trackNumber", "discNumber"] as const) {
        if (
          !result[field] &&
          Number.isInteger(match[field]) &&
          match[field] > 0
        )
          result[field] = match[field];
      }
    }
  } catch {
    checkCancelled(signal);
    warnings.push("Rocksky metadata is temporarily unavailable.");
  }
  // When a specific release is selected, prefer its artwork to a name match.
  if (result.releaseId || !result.albumArt) {
    try {
      if (!result.releaseId && result.album) {
        const quote = (value: string) => `"${value.replace(/[\\"]/g, " ")}"`;
        const query = `release:${quote(result.album)} AND artist:${quote(result.albumArtist || result.artist)}`;
        const found = await json(
          `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=5`,
          {},
          signal,
        );
        result.releaseId = found.releases?.find(
          (release: { title: string; "artist-credit"?: Credit[] }) =>
            normalized(release.title) === normalized(result.album) &&
            normalized(artistName(release["artist-credit"])) ===
              normalized(result.albumArtist || result.artist),
        )?.id;
      }
      if (result.releaseId && /^[0-9a-f-]{36}$/i.test(result.releaseId)) {
        const art = await json(
          `https://coverartarchive.org/release/${result.releaseId}`,
          {},
          signal,
        );
        const front = art.images?.find(
          (item: { front?: boolean }) => item.front,
        );
        result.albumArt =
          imageUrl(front?.thumbnails?.["500"]) ||
          imageUrl(front?.image) ||
          result.albumArt;
      }
    } catch {
      checkCancelled(signal);
      if (!result.albumArt)
        warnings.push("No cover could be retrieved for this release.");
    }
  }
  if (warnings.length) result.enrichmentWarning = warnings.join(" ");
  return result;
}

/** Low-level lookup of one track. Only explicit identification actions call it. */
async function lookupTrack(
  track: DeviceTrack,
  method: "fingerprint" | "search",
  searchText?: string,
  signal?: AbortSignal,
): Promise<MetadataSuggestion[]> {
  checkCancelled(signal);
  if (method === "search") {
    const term =
      searchText?.trim() ||
      [track.title, track.artist].filter(Boolean).join(" ");
    if (!term)
      throw new Error("Enter a title or artist to search MusicBrainz.");
    const response = await json(
      `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(term)}&fmt=json&limit=10`,
      {},
      signal,
    );
    return ((response.recordings as Recording[]) ?? []).flatMap((r) =>
      suggestions(r, "MusicBrainz", Number(r.score)),
    );
  }
  const key = Constants.expoConfig?.extra?.acoustidClientKey as
    | string
    | undefined;
  if (!key)
    throw new Error(
      "AcoustID identification is not configured in this build. You can search MusicBrainz or edit the tags manually.",
    );
  if (!(track.durationMs > 0))
    throw new Error(
      "Cannot identify audio without a known duration. Use MusicBrainz search instead.",
    );
  const fingerprint = await localMusicNative.fingerprint(track.id);
  checkCancelled(signal);
  const body = new URLSearchParams({
    client: key,
    duration: String(Math.round(track.durationMs / 1000)),
    fingerprint,
    meta: "recordingids",
    format: "json",
  });
  const response = await json(
    "https://api.acoustid.org/v2/lookup",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    signal,
  );
  if (response.status !== "ok")
    throw new Error(response.error?.message ?? "AcoustID lookup failed");
  const ids = new Map<string, number>();
  for (const match of response.results ?? [])
    for (const recording of match.recordings ?? []) {
      if (!ids.has(recording.id)) ids.set(recording.id, match.score);
    }
  const result: MetadataSuggestion[] = [];
  // A handful of candidates for this ONE recording, never other library tracks.
  for (const [id, score] of [...ids].slice(0, 3)) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const recording = await json(
      `https://musicbrainz.org/ws/2/recording/${id}?inc=artists+releases&fmt=json`,
      {},
      signal,
    );
    result.push(...suggestions(recording, "AcoustID", score));
  }
  return result;
}

function beginIdentification() {
  if (identifying)
    throw new Error("Finish identifying the current track selection first.");
  identifying = true;
}

export async function identifyDeviceTrack(
  track: DeviceTrack,
  method: "fingerprint" | "search",
  searchText?: string,
): Promise<MetadataSuggestion[]> {
  if (!track || typeof track.id !== "string" || !track.id.trim())
    throw new Error("Select one local track to identify.");
  beginIdentification();
  try {
    return await lookupTrack(track, method, searchText);
  } finally {
    identifying = false;
  }
}

export type TrackIdentificationResult = {
  track: DeviceTrack;
  suggestions: MetadataSuggestion[];
  error?: string;
};
export type IdentificationProgress = {
  total: number;
  completed: number;
  current?: DeviceTrack;
  result?: TrackIdentificationResult;
};

/** Explicit user selection only; fingerprints and lookups run one track at a time. */
export async function identifyDeviceTracks(
  tracks: DeviceTrack[],
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: IdentificationProgress) => void;
  } = {},
): Promise<TrackIdentificationResult[]> {
  if (
    !Array.isArray(tracks) ||
    tracks.some(
      (track) => !track || typeof track.id !== "string" || !track.id.trim(),
    )
  )
    throw new Error("Select local tracks to identify.");
  const selected = [
    ...new Map(tracks.map((track) => [track.id, { ...track }])).values(),
  ];
  if (!selected.length) return [];
  beginIdentification();
  const results: TrackIdentificationResult[] = [];
  try {
    for (const track of selected) {
      checkCancelled(options.signal);
      options.onProgress?.({
        total: selected.length,
        completed: results.length,
        current: track,
      });
      let result: TrackIdentificationResult;
      try {
        result = {
          track,
          suggestions: await lookupTrack(
            track,
            "fingerprint",
            undefined,
            options.signal,
          ),
        };
      } catch (error) {
        checkCancelled(options.signal);
        result = {
          track,
          suggestions: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
      results.push(result);
      options.onProgress?.({
        total: selected.length,
        completed: results.length,
        result,
      });
    }
    return results;
  } finally {
    identifying = false;
  }
}
