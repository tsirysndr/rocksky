/**
 * KLIPY media API (GIFs, stickers, clips). Set `VITE_KLIPY_API_KEY` to enable
 * the picker. https://klipy.com/developers — endpoints follow
 * `api.klipy.com/api/v1/{key}/{type}/{search|trending}`.
 *
 * Note: this API/plan exposes `gifs`, `stickers`, and `clips`. There is no
 * `memes` route (it 404s "Route not found"), so we don't offer that tab.
 */
const KLIPY_KEY = import.meta.env.VITE_KLIPY_API_KEY ?? "";
const KLIPY_BASE = "https://api.klipy.com/api/v1";

/** True when a key is configured; the picker degrades to a hint otherwise. */
export const KLIPY_ENABLED = Boolean(KLIPY_KEY);

export type KlipyMediaType = "gifs" | "stickers" | "clips";

export const KLIPY_TABS: { type: KlipyMediaType; label: string }[] = [
  { type: "gifs", label: "GIFs" },
  { type: "stickers", label: "Stickers" },
  { type: "clips", label: "Clips" },
];

/** The media embed persisted on a shout record (mirrors app.rocksky.shout#gif). */
export interface GifEmbed {
  url: string;
  previewUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
}

/** A pickable media item: renders in the grid, embeds on select. */
export interface MediaResult extends GifEmbed {
  id: string;
  /** True when `url` is a video (mp4) rather than an image. */
  isVideo: boolean;
}

/** True when a URL points at a video the UI should render with <video>. */
export function isVideoUrl(url: string): boolean {
  return /\.mp4($|\?)/i.test(url);
}

interface Rendition {
  url: string;
  width?: number;
  height?: number;
}

// KLIPY returns two different `file` shapes:
//  • gifs / stickers — nested by size then format:
//      file: { md: { gif: {url,width,height}, webp: {...}, mp4: {...} }, ... }
//  • clips — flat format → url string, with dimensions in a sibling `file_meta`:
//      file: { mp4: "url", gif: "url", webp: "url" }
//      file_meta: { mp4: {width,height}, gif: {...}, webp: {...} }
type NestedRendition = {
  url?: string;
  width?: number | string;
  height?: number | string;
};
type NestedFormatMap = Record<string, NestedRendition | undefined>;
type NestedFile = Record<string, NestedFormatMap | undefined>;
type FlatFile = Record<string, string | undefined>;
type MetaMap = Record<
  string,
  { width?: number | string; height?: number | string } | undefined
>;

interface KlipyItem {
  id?: number | string;
  slug?: string;
  title?: string;
  file?: NestedFile | FlatFile;
  files?: NestedFile | FlatFile;
  file_meta?: MetaMap;
}

const num = (v: number | string | undefined): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? (n as number) : undefined;
};

/** A `file` whose top-level values are strings is the flat (clips) shape. */
function isFlatFile(file: NestedFile | FlatFile): file is FlatFile {
  return Object.values(file).some((v) => typeof v === "string");
}

/** Flat (clips) shape → renditions from format→url strings + `file_meta` dims. */
function pickFlat(
  file: FlatFile,
  meta: MetaMap | undefined,
  wantVideo: boolean,
): { full?: Rendition; preview?: Rendition } {
  const at = (fmt: string): Rendition | undefined => {
    const url = file[fmt];
    if (typeof url !== "string" || !url) return undefined;
    const m = meta?.[fmt];
    return { url, width: num(m?.width), height: num(m?.height) };
  };
  const fullFmts = wantVideo ? ["mp4", "webp", "gif"] : ["gif", "webp", "mp4"];
  let full: Rendition | undefined;
  for (const f of fullFmts) if (!full) full = at(f);
  let preview: Rendition | undefined;
  for (const f of ["gif", "webp", "jpg", "png"]) if (!preview) preview = at(f);
  return { full, preview };
}

/** Nested (gifs/stickers) shape → walk size then format. */
function pickNested(
  file: NestedFile,
  wantVideo: boolean,
): { full?: Rendition; preview?: Rendition } {
  const sizes = ["md", "sm", "hd", "lg", "xs"];
  const fullFmts = wantVideo ? ["mp4", "webp", "gif"] : ["gif", "webp", "mp4"];
  const previewFmts = ["webp", "gif", "png", "jpg"];
  const norm = (r: NestedRendition | undefined): Rendition | undefined =>
    r?.url ? { url: r.url, width: num(r.width), height: num(r.height) } : undefined;

  let full: Rendition | undefined;
  for (const s of sizes) {
    const fm = file[s];
    if (!fm) continue;
    for (const f of fullFmts) if (!full) full = norm(fm[f]);
    if (full) break;
  }
  let preview: Rendition | undefined;
  for (const s of ["sm", "md", "hd", "xs"]) {
    const fm = file[s];
    if (!fm) continue;
    for (const f of previewFmts) if (!preview) preview = norm(fm[f]);
    if (preview) break;
  }
  return { full, preview };
}

function toResult(item: KlipyItem, type: KlipyMediaType): MediaResult | null {
  const wantVideo = type === "clips";
  const file = item.file ?? item.files;
  if (!file) return null;
  const { full, preview } = isFlatFile(file)
    ? pickFlat(file, item.file_meta, wantVideo)
    : pickNested(file, wantVideo);
  if (!full?.url) return null;
  return {
    id: String(item.id ?? item.slug ?? full.url),
    url: full.url,
    previewUrl: preview?.url ?? full.url,
    alt: item.title?.trim() || item.slug || undefined,
    width: full.width,
    height: full.height,
    isVideo: isVideoUrl(full.url),
  };
}

/** A stable per-browser id KLIPY uses to personalize trending/recents. */
function customerId(): string {
  try {
    const key = "rocksky:klipy-cid";
    let v = localStorage.getItem(key);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return "anon";
  }
}

async function request(
  type: KlipyMediaType,
  action: "search" | "trending",
  params: URLSearchParams,
): Promise<MediaResult[]> {
  if (!KLIPY_KEY) return [];
  params.set("customer_id", customerId());
  const url = `${KLIPY_BASE}/${encodeURIComponent(KLIPY_KEY)}/${type}/${action}?${params}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { data?: KlipyItem[] } | KlipyItem[];
    };
    const list = Array.isArray(json.data)
      ? json.data
      : (json.data?.data ?? []);
    return list
      .map((it) => toResult(it, type))
      .filter((r): r is MediaResult => r !== null);
  } catch {
    return [];
  }
}

/** Search KLIPY media of a given type; empty query → trending. */
export function searchMedia(
  type: KlipyMediaType,
  q: string,
  perPage = 24,
): Promise<MediaResult[]> {
  const query = q.trim();
  if (!query) {
    return request(
      type,
      "trending",
      new URLSearchParams({ page: "1", per_page: String(perPage) }),
    );
  }
  return request(
    type,
    "search",
    new URLSearchParams({ q: query, page: "1", per_page: String(perPage) }),
  );
}

/** Adapt a stored gif embed back into the picker's MediaResult shape. */
export function gifEmbedToMedia(g: GifEmbed): MediaResult {
  return { ...g, id: g.url, isVideo: isVideoUrl(g.url) };
}
