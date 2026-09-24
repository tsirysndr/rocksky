export const searchSections = [
  { key: "tracks", label: "Songs", singular: "Song" },
  { key: "artists", label: "Artists", singular: "Artist" },
  { key: "albums", label: "Albums", singular: "Album" },
  { key: "playlists", label: "Playlists", singular: "Playlist" },
  { key: "users", label: "People", singular: "Person" },
] as const;

export type SearchKind = (typeof searchSections)[number]["key"];
export type SearchScope = SearchKind | "all";
export interface SearchItem {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  image?: string;
  href: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// The SDK's generated search union omits federation metadata. Validate the
// actual federated response before turning it into navigable UI results.
export function normalizeSearch(
  response: unknown,
  appUrl: string,
): SearchItem[] {
  const hits = record(response).hits;
  if (!Array.isArray(hits)) return [];
  const items: SearchItem[] = [];
  const seen = new Set<string>();
  for (const value of hits) {
    const hit = record(value);
    const section = searchSections.find(
      (section) => section.key === record(hit._federation).indexUid,
    );
    if (!section) continue;
    const kind = section.key;
    const handle = text(hit.handle);
    const title =
      kind === "users"
        ? text(hit.displayName) || handle
        : text(hit.title) || text(hit.name);
    if (!title) continue;
    let path: string;
    if (kind === "users") {
      if (!handle) continue;
      path = `/profile/${encodeURIComponent(handle)}`;
    } else {
      const match = text(hit.uri).match(
        /^at:\/\/([^/]+)\/app\.rocksky\.(song|artist|album|playlist)\/([^/]+)$/,
      );
      const collection = {
        tracks: "song",
        artists: "artist",
        albums: "album",
        playlists: "playlist",
      }[kind];
      if (!match || match[2] !== collection) continue;
      path = `/${encodeURIComponent(match[1])}/${match[2]}/${encodeURIComponent(match[3])}`;
    }
    const id = `${kind}:${path}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const image =
      text(hit.albumArt) ||
      text(hit.cover) ||
      text(hit.picture) ||
      text(hit.avatar);
    items.push({
      id,
      kind,
      title,
      subtitle: kind === "users" ? `@${handle}` : text(hit.artist),
      image:
        /^https?:\/\//.test(image) && !image.endsWith("/@jpeg")
          ? image
          : undefined,
      href: `${appUrl}${path}`,
    });
  }
  return items;
}
