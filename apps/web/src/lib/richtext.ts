/**
 * Rich text helpers for shouts: detecting `@mentions`, resolving them to
 * ATProto mention facets (UTF-8 byte ranges → DID), splitting a message into
 * renderable segments, and typeahead actor search for the composer.
 *
 * Rocksky handles are ATProto/Bluesky handles, so resolution and typeahead go
 * through the public Bluesky AppView (same as atradio.fm).
 */

const BSKY_APPVIEW = "https://public.api.bsky.app";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** UTF-8 byte length of a string (facets index by bytes, not code units). */
function byteLength(s: string): number {
  return encoder.encode(s).length;
}

/** A mention facet stored on a shout record. */
export interface Mention {
  did: string;
  byteStart: number;
  byteEnd: number;
}

/**
 * Handle mentions like `@alice.bsky.social`. Matches the leading `@` plus a
 * dotted handle; the capture excludes any trailing punctuation.
 */
const MENTION_RE =
  /(^|[\s(])@([a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]|[a-zA-Z0-9])/g;

export interface MentionSpan {
  /** String (code-unit) index of the `@`. */
  start: number;
  /** String index just past the handle. */
  end: number;
  /** Handle without the leading `@`. */
  handle: string;
}

/** Find `@handle` spans in text (string indices). */
export function detectMentionSpans(text: string): MentionSpan[] {
  const spans: MentionSpan[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const lead = m[1] ?? "";
    const handle = m[2];
    if (!handle) continue;
    const at = (m.index ?? 0) + lead.length;
    spans.push({ start: at, end: at + 1 + handle.length, handle });
  }
  return spans;
}

/** Resolve a single handle to a DID via the public AppView (null on failure). */
async function resolveHandle(handle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BSKY_APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(
        handle,
      )}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { did?: string };
    return d.did ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve every `@handle` in `text` to a mention facet (UTF-8 byte range → DID).
 * Handles that don't resolve are silently dropped. Resolution is cached per call
 * so a handle mentioned twice is only fetched once.
 */
export async function resolveMentionFacets(text: string): Promise<Mention[]> {
  const spans = detectMentionSpans(text);
  if (spans.length === 0) return [];

  const cache = new Map<string, string | null>();
  const resolve = async (handle: string): Promise<string | null> => {
    const key = handle.toLowerCase();
    if (cache.has(key)) return cache.get(key)!;
    const did = await resolveHandle(handle);
    cache.set(key, did);
    return did;
  };

  const facets: Mention[] = [];
  for (const span of spans) {
    const did = await resolve(span.handle);
    if (!did) continue;
    facets.push({
      did,
      byteStart: byteLength(text.slice(0, span.start)),
      byteEnd: byteLength(text.slice(0, span.end)),
    });
  }
  return facets;
}

export type Segment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; target: string }
  | { type: "link"; value: string; href: string };

/** Matches http(s) URLs; the capture excludes common trailing punctuation. */
const URL_RE = /https?:\/\/[^\s<]+[^\s<.,:;!?)\]}'"]/g;

/** Split a plain-text run into text + link segments (URLs → clickable). */
function splitLinks(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const url = m[0];
    if (start > last) out.push({ type: "text", value: text.slice(last, start) });
    out.push({ type: "link", value: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

/** Regex-based mention + link segmentation, used when a shout has no facets. */
function segmentWithoutFacets(text: string): Segment[] {
  const spans = detectMentionSpans(text);
  if (spans.length === 0) return splitLinks(text);
  const out: Segment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      out.push(...splitLinks(text.slice(cursor, span.start)));
    }
    out.push({
      type: "mention",
      value: text.slice(span.start, span.end),
      target: span.handle,
    });
    cursor = span.end;
  }
  if (cursor < text.length) out.push(...splitLinks(text.slice(cursor)));
  return out;
}

/**
 * Split a shout's message into plain + mention + link segments. When facets are
 * present, mentions come from their byte ranges (linking to the DID); otherwise
 * `@handles` are detected heuristically. URLs are always linkified.
 */
export function segmentText(
  text: string,
  facets: Mention[] | undefined,
): Segment[] {
  if (!facets?.length) return segmentWithoutFacets(text);
  const bytes = encoder.encode(text);
  const sorted = [...facets].sort((a, b) => a.byteStart - b.byteStart);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const f of sorted) {
    if (
      f.byteStart < cursor ||
      f.byteEnd > bytes.length ||
      f.byteEnd <= f.byteStart
    )
      continue;
    if (f.byteStart > cursor) {
      segments.push(
        ...splitLinks(decoder.decode(bytes.slice(cursor, f.byteStart))),
      );
    }
    segments.push({
      type: "mention",
      value: decoder.decode(bytes.slice(f.byteStart, f.byteEnd)),
      target: f.did,
    });
    cursor = f.byteEnd;
  }
  if (cursor < bytes.length) {
    segments.push(...splitLinks(decoder.decode(bytes.slice(cursor))));
  }
  return segments;
}

export interface ActorSuggestion {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

/** Typeahead actor search (Bluesky AppView) for the mention autocomplete. */
export async function searchActorsTypeahead(
  q: string,
  limit = 6,
): Promise<ActorSuggestion[]> {
  const query = q.trim();
  if (!query) return [];
  const url =
    `${BSKY_APPVIEW}/xrpc/app.bsky.actor.searchActorsTypeahead?q=` +
    encodeURIComponent(query) +
    `&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const d = (await res.json()) as {
      actors?: {
        did: string;
        handle: string;
        displayName?: string;
        avatar?: string;
      }[];
    };
    return (d.actors ?? []).map((a) => ({
      did: a.did,
      handle: a.handle,
      displayName: a.displayName,
      avatar: a.avatar,
    }));
  } catch {
    return [];
  }
}

/** The `@token` the caret currently sits in, for the mention popup. */
export function activeMentionToken(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      const before = i === 0 ? " " : text[i - 1];
      if (i === 0 || /[\s(]/.test(before)) {
        return { start: i, query: text.slice(i + 1, caret) };
      }
      return null;
    }
    if (!/[a-zA-Z0-9.\-]/.test(ch)) return null;
    i--;
  }
  return null;
}
