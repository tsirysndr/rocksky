import { consola } from "consola";
import type { Context } from "context";

// Client for the Discogs service (discogs/ Go service, on ctx.discogs /
// DISCOGS_URL). It is rate limited to Discogs' 60 requests per minute per
// token and caches in-process, so callers may ask freely but must treat every
// answer as optional.

export interface DiscogsCredit {
  artistId?: number;
  name: string;
  role?: string;
  tracks?: string;
}

export interface DiscogsEnrichedTrack {
  title: string;
  artist: string;
  albumArtist?: string;
  album: string;
  albumArt?: string;
  durationMs?: number;
  trackNumber?: number;
  discNumber?: number;
  trackPosition?: string;
  releaseDate?: string;
  year?: number;
  originalYear?: number;
  label?: string;
  catalogNumber?: string;
  country?: string;
  barcode?: string;
  formats?: string[];
  genres?: string[];
  styles?: string[];
  discogsUrl?: string;
  credits?: DiscogsCredit[];
  discogsReleaseId?: number;
  discogsMasterId?: number;
  discogsArtistId?: number;
}

export interface DiscogsMatch {
  id: number;
  masterId?: number;
  type?: string;
  artist: string;
  album: string;
  albumArt?: string;
  year?: number;
  country?: string;
  label?: string;
  catalogNumber?: string;
  barcode?: string;
  formats?: string[];
  genres?: string[];
  styles?: string[];
  url?: string;
  score: number;
}

export interface DiscogsEnrichResponse {
  track: DiscogsEnrichedTrack | null;
  matches: DiscogsMatch[];
}

// The Discogs objects the service passes through on /releases/:id and
// /masters/:id, in its own JSON shape (snake_case, as Discogs sends it).
export interface DiscogsArtistCredit {
  id?: number;
  name: string;
  anv?: string;
  join?: string;
  role?: string;
  tracks?: string;
  resource_url?: string;
}

export interface DiscogsLabelRef {
  id?: number;
  name: string;
  catno?: string;
  entity_type?: string;
  entity_type_name?: string;
  resource_url?: string;
}

export interface DiscogsFormat {
  name?: string;
  qty?: string;
  text?: string;
  descriptions?: string[];
}

export interface DiscogsImage {
  type?: string;
  uri?: string;
  uri150?: string;
  width?: number;
  height?: number;
}

export interface DiscogsIdentifier {
  type: string;
  value?: string;
  description?: string;
}

export interface DiscogsTracklistEntry {
  position?: string;
  type_?: string;
  title: string;
  duration?: string;
  artists?: DiscogsArtistCredit[];
  extraartists?: DiscogsArtistCredit[];
}

export interface DiscogsRelease {
  id: number;
  title: string;
  year?: number;
  released?: string;
  country?: string;
  notes?: string;
  uri?: string;
  master_id?: number;
  data_quality?: string;
  artists?: DiscogsArtistCredit[];
  extraartists?: DiscogsArtistCredit[];
  labels?: DiscogsLabelRef[];
  companies?: DiscogsLabelRef[];
  formats?: DiscogsFormat[];
  genres?: string[];
  styles?: string[];
  tracklist?: DiscogsTracklistEntry[];
  images?: DiscogsImage[];
  identifiers?: DiscogsIdentifier[];
}

export interface DiscogsMaster {
  id: number;
  title: string;
  year?: number;
  main_release?: number;
  uri?: string;
  artists?: DiscogsArtistCredit[];
  genres?: string[];
  styles?: string[];
}

export interface DiscogsQuery {
  artist: string;
  album?: string;
  title?: string;
}

/**
 * Ask the Discogs service for the best matching release. Never throws:
 * `undefined` means the service could not answer (unreachable, over quota,
 * breaker open) and the question is still open, while a response with a null
 * `track` means Discogs itself has no match.
 */
export const enrichWithDiscogs = async (
  ctx: Context,
  query: DiscogsQuery,
): Promise<DiscogsEnrichResponse | undefined> => {
  try {
    const { data } = await ctx.discogs.post<DiscogsEnrichResponse>("/enrich", {
      title: query.title ?? "",
      artist: query.artist,
      album: query.album,
    });
    return data;
  } catch (error) {
    consola.warn(
      "Discogs enrichment failed:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
};

/**
 * Fetch a full release. /enrich already deep-fetched it, so the service
 * answers this from its own cache and it costs no Discogs quota. Never throws.
 */
export const getDiscogsRelease = async (
  ctx: Context,
  id: number,
): Promise<DiscogsRelease | undefined> => {
  try {
    const { data } = await ctx.discogs.get<DiscogsRelease>(`/releases/${id}`);
    return data;
  } catch (error) {
    consola.warn(
      `Discogs release ${id} fetch failed:`,
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
};

/**
 * Fetch a master. Unlike the release this can cost a request out of the
 * quota, so callers should ask only for masters they do not already have.
 */
export const getDiscogsMaster = async (
  ctx: Context,
  id: number,
): Promise<DiscogsMaster | undefined> => {
  try {
    const { data } = await ctx.discogs.get<DiscogsMaster>(`/masters/${id}`);
    return data;
  } catch (error) {
    consola.warn(
      `Discogs master ${id} fetch failed:`,
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
};
