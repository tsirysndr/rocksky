export type ShareKind =
  | "profile"
  | "track"
  | "album"
  | "artist"
  | "scrobble"
  | "wrapped"
  | "chart";
export type ShareItem = {
  kind: ShareKind;
  uri: string;
  title: string;
  subtitle?: string;
  artwork?: string;
  year?: number;
  owner?: {
    did: string;
    displayName?: string;
    handle?: string;
    avatar?: string | null;
  };
  period?: string;
  stats?: { label: string; value: string }[];
  rankings?: {
    label: string;
    names: string[];
    artworks?: (string | null | undefined)[];
    artworkShape?: "circle" | "rounded";
  }[];
};
const collections = {
  song: "app.rocksky.song",
  track: "app.rocksky.song",
  album: "app.rocksky.album",
  artist: "app.rocksky.artist",
  scrobble: "app.rocksky.scrobble",
} as const;
const segment = (value: string) => value.length > 0 && !/[/?#\s]/.test(value);

/** Canonical web links also work for recipients without Rocksky installed. */
export function shareUrl(
  item: Pick<ShareItem, "kind" | "uri" | "year">,
): string {
  if (
    item.kind === "profile" ||
    item.kind === "wrapped" ||
    item.kind === "chart"
  ) {
    if (
      item.kind === "wrapped" &&
      (!Number.isInteger(item.year) ||
        item.year! < 2000 ||
        item.year! > new Date().getFullYear())
    ) {
      throw new Error("Choose a valid year for your Wrapped.");
    }
    const actor = item.uri.replace(/^at:\/\//, "");
    if (!segment(actor))
      throw new Error("This profile has no shareable link yet.");
    return `https://rocksky.app/profile/${encodeURIComponent(actor)}${item.kind === "wrapped" ? `?wrapped=${item.year}` : ""}`;
  }
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(item.uri);
  const type = item.kind === "track" ? "song" : item.kind;
  if (
    !match ||
    match[2] !== collections[type] ||
    !segment(match[1]) ||
    !segment(match[3])
  ) {
    throw new Error("This item has no shareable link yet.");
  }
  return `https://rocksky.app/${encodeURIComponent(match[1])}/${type}/${encodeURIComponent(match[3])}`;
}

export function shareText(item: ShareItem): string {
  if (item.kind === "track" && !item.uri)
    return `${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}\nListening on Rocksky\nhttps://rocksky.app`;
  return `${item.kind === "scrobble" ? "Just scrobbled: " : ""}${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}\n${shareUrl(item)}`;
}

/** Preserve the public URL when long titles need to fit a social composer. */
export function composePostText(item: ShareItem, limit = 300): string {
  const text = shareText(item);
  if (Array.from(text).length <= limit) return text;
  const split = text.lastIndexOf("\n");
  const link = text.slice(split + 1);
  const available = limit - Array.from(link).length - 2;
  if (available <= 0) return link;
  return `${Array.from(text.slice(0, split)).slice(0, available).join("").trimEnd()}…\n${link}`;
}

/** Parses canonical web paths and the same paths under rocksky://. */
export function parseSharePath(path: string) {
  try {
    const [pathname, query = ""] = path.split("?");
    const parts = pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .map(decodeURIComponent);
    if (!parts.every(segment)) return undefined;
    if (parts.length === 2 && parts[0] === "profile") {
      const year = new URLSearchParams(query).get("wrapped");
      if (
        year &&
        /^\d{4}$/.test(year) &&
        +year >= 2000 &&
        +year <= new Date().getFullYear()
      ) {
        return {
          name: "Wrapped" as const,
          params: { did: parts[1], year: +year },
        };
      }
      return { name: "UserProfile" as const, params: { did: parts[1] } };
    }
    if (parts.length !== 3) return undefined;
    const [actor, kind, key] = parts;
    if (!Object.hasOwn(collections, kind)) return undefined;
    const collection = collections[kind as keyof typeof collections];
    const name =
      kind === "album"
        ? "AlbumDetails"
        : kind === "artist"
          ? "ArtistDetails"
          : "SongDetails";
    return { name, params: { uri: `at://${actor}/${collection}/${key}` } };
  } catch {
    return undefined;
  }
}
