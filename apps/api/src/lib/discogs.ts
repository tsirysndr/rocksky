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
