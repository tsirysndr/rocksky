import { localMusicNative } from "../../modules/rocksky-engine";
import Constants from "expo-constants";
import type { DeviceTrack } from "./deviceMusic";

export type MetadataSuggestion = {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  mbId: string;
  year?: number;
  source: "AcoustID" | "MusicBrainz";
  score?: number;
};
let identifying = false;
let lastRequest = 0;

async function json(url: string, init?: RequestInit) {
  const delay = Math.max(0, 1100 - (Date.now() - lastRequest));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequest = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "Rocksky/2.1.2 (https://rocksky.app)",
        ...init?.headers,
      },
    });
    if (!response.ok)
      throw new Error(
        `Metadata service returned ${response.status}. Try again later.`,
      );
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

type Credit = { name?: string; artist?: { name: string }; joinphrase?: string };
type Recording = {
  id: string;
  title: string;
  score?: number;
  "artist-credit"?: Credit[];
  releases?: { title: string; date?: string; "artist-credit"?: Credit[] }[];
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
  return (recording.releases?.slice(0, 12) ?? [{ title: "" }]).map(
    (release) => ({
      title: recording.title,
      artist: artistName(recording["artist-credit"]),
      album: release.title,
      albumArtist:
        artistName(release["artist-credit"]) ||
        artistName(recording["artist-credit"]),
      mbId: recording.id,
      year: release.date
        ? Number(release.date.slice(0, 4)) || undefined
        : undefined,
      source,
      score,
    }),
  );
}

/** Takes exactly one selected track. No scanner, lifecycle hook or batch API calls this. */
export async function identifyDeviceTrack(
  track: DeviceTrack,
  method: "fingerprint" | "search",
  searchText?: string,
): Promise<MetadataSuggestion[]> {
  if (!track || typeof track.id !== "string" || !track.id.trim()) {
    throw new Error("Select one local track to identify.");
  }
  if (identifying)
    throw new Error("Finish identifying the current track first.");
  identifying = true;
  try {
    if (method === "search") {
      const term =
        searchText?.trim() ||
        [track.title, track.artist].filter(Boolean).join(" ");
      if (!term)
        throw new Error("Enter a title or artist to search MusicBrainz.");
      const response = await json(
        `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(term)}&fmt=json&limit=10`,
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
    const body = new URLSearchParams({
      client: key,
      duration: String(Math.round(track.durationMs / 1000)),
      fingerprint,
      meta: "recordingids",
      format: "json",
    });
    const response = await json("https://api.acoustid.org/v2/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
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
      );
      result.push(...suggestions(recording, "AcoustID", score));
    }
    return result;
  } finally {
    identifying = false;
  }
}
