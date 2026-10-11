import type {
  LibraryEntry,
  LibraryPage,
  LibrarySource,
} from "./remoteLibraries";

export const PLYR_ID = "plyr.fm";
export const PLYR_API = "https://api.plyr.fm";
export const plyrSource: LibrarySource = {
  id: PLYR_ID,
  kind: "plyr",
  name: "plyr.fm",
  baseUrl: PLYR_API,
  username: "",
};
export const plyrTabs = ["Tracks", "Top tracks", "Albums", "Artists", "Radio"];
type Item = {
  id?: number | string;
  title?: string;
  artist?: string;
  artist_display_name?: string;
  artist_handle?: string;
  artist_did?: string;
  artist_avatar_url?: string | null;
  did?: string;
  handle?: string;
  display_name?: string;
  avatar_url?: string | null;
  thumbnail_url?: string | null;
  image_url?: string | null;
  artwork_url?: string | null;
  duration?: number;
  slug?: string;
  name?: string;
  description?: string;
  album?: {
    title?: string;
    thumbnail_url?: string | null;
    image_url?: string | null;
  } | null;
};

export async function plyrRequest(path: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${PLYR_API}${path}`, {
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        `plyr.fm request failed (${response.status}). Please try again.`,
      );
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function plyrEntry(track: Item): LibraryEntry {
  return {
    id: String(track.id),
    kind: "track",
    title: track.title ?? "Untitled",
    artist:
      track.artist ?? track.artist_display_name ?? track.artist_handle ?? "",
    album: track.album?.title ?? "",
    durationMs: Math.max(0, Number(track.duration ?? 0) * 1000),
    art:
      track.thumbnail_url ??
      track.image_url ??
      track.artwork_url ??
      track.album?.thumbnail_url ??
      track.album?.image_url ??
      track.artist_avatar_url ??
      null,
  };
}
function artistEntry(artist: Item): LibraryEntry {
  return {
    id: `artist:${artist.did ?? artist.artist_did}`,
    kind: "artist",
    title:
      artist.display_name ??
      artist.artist ??
      artist.artist_handle ??
      artist.handle ??
      "Unknown artist",
    artist: artist.handle ?? artist.artist_handle ?? "",
    album: "",
    durationMs: 0,
    art: artist.avatar_url ?? artist.artist_avatar_url ?? null,
  };
}
function filter(entries: LibraryEntry[], query: string): LibraryEntry[] {
  const term = query.toLocaleLowerCase();
  return entries.filter((e) =>
    `${e.title} ${e.artist} ${e.album}`.toLocaleLowerCase().includes(term),
  );
}

// Numeric tokens keep opaque API cursors compatible with the library paging UI.
export function createPlyrBrowser(request = plyrRequest) {
  let sequence = 0;
  const cursors = new Map<number, { key: string; cursor: string }>();
  return async (
    id: string,
    query: string,
    offset: number,
  ): Promise<LibraryPage> => {
    const key = JSON.stringify([id, query]);
    const token = offset ? cursors.get(offset) : undefined;
    if (offset && token?.key !== key)
      throw new Error("This page expired. Pull down to refresh plyr.fm.");
    const done = (entries: LibraryEntry[]) => ({
      entries: filter(entries, query),
      nextOffset: null,
    });
    if (id === "radio") {
      const data = await request("/radio/stations");
      return done(
        data.stations.map((s: Item) => ({
          id: `station:${s.slug}`,
          title: s.name ?? s.slug ?? "Radio",
          kind: "station",
          artist: s.description ?? "",
          album: "",
          art: null,
          durationMs: 0,
        })),
      );
    }
    if (id.startsWith("station:")) {
      const data = await request(
        `/radio/state?station=${encodeURIComponent(id.slice(8))}&catalog_only=true&limit=75`,
      );
      const rotation: Item[] = data.rotation ?? [];
      const index = Math.max(
        0,
        rotation.findIndex((t) => t.id === data.current?.id),
      );
      return done(
        [...rotation.slice(index), ...rotation.slice(0, index)].map(plyrEntry),
      );
    }
    if (id === "albums") {
      const data = await request("/albums/");
      return done(
        data.albums.map((a: Item) => ({
          id: `album:${encodeURIComponent(a.artist_handle ?? "")}/${encodeURIComponent(a.slug ?? "")}`,
          title: a.title ?? "Untitled",
          kind: "album",
          artist: a.artist ?? a.artist_handle ?? "",
          album: a.title ?? "",
          art: a.thumbnail_url ?? a.image_url ?? null,
          durationMs: 0,
        })),
      );
    }
    if (id.startsWith("album:")) {
      const data = await request(`/albums/${id.slice(6)}`);
      return done(data.tracks.map(plyrEntry));
    }
    if (id === "top tracks")
      return done(
        (await request("/tracks/top?limit=100&period=all_time")).map(plyrEntry),
      );
    if (query.length >= 2 && (id === "tracks" || id === "artists")) {
      const data = await request(
        `/search/?q=${encodeURIComponent(query)}&type=${id}&limit=50`,
      );
      return {
        entries: data.results.map(id === "artists" ? artistEntry : plyrEntry),
        nextOffset: null,
      };
    }
    const params = new URLSearchParams({ limit: "50" });
    if (token) params.set("cursor", token.cursor);
    if (id.startsWith("artist:")) params.set("artist_did", id.slice(7));
    const data = await request(`/tracks/?${params}`);
    const tracks: Item[] = data.tracks;
    const entries =
      id === "artists"
        ? [
            ...new Map(
              tracks
                .filter((t) => t.artist_did)
                .map((t) => [t.artist_did, artistEntry(t)]),
            ).values(),
          ]
        : tracks.map(plyrEntry);
    let nextOffset: number | null = null;
    if (
      data.has_more &&
      data.next_cursor &&
      data.next_cursor !== token?.cursor
    ) {
      nextOffset = ++sequence;
      cursors.set(nextOffset, { key, cursor: data.next_cursor });
      if (cursors.size > 2000) cursors.delete(cursors.keys().next().value!);
    }
    return { entries: filter(entries, query), nextOffset };
  };
}
export const browsePlyr = createPlyrBrowser();

export async function plyrTrack(id: string) {
  const track = await plyrRequest(`/tracks/${encodeURIComponent(id)}`);
  if (track.gated || track.support_gate)
    throw new Error("This track requires supporter access on plyr.fm.");
  if (!track.file_id)
    throw new Error("plyr.fm did not return a playable track.");
  return {
    entry: plyrEntry(track),
    url: `${PLYR_API}/audio/${encodeURIComponent(track.file_id)}`,
  };
}
