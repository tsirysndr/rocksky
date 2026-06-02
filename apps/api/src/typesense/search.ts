import type { SelectAlbum } from "schema/albums";
import type { SelectArtist } from "schema/artists";
import type { SelectPlaylist } from "schema/playlists";
import type { SelectTrack } from "schema/tracks";
import type { SelectUser } from "schema/users";
import { typesense } from "./client";
import { withTypesenseRetry } from "./retry";
import {
  ALBUMS_COLLECTION,
  ARTISTS_COLLECTION,
  PLAYLISTS_COLLECTION,
  TRACKS_COLLECTION,
  USERS_COLLECTION,
} from "./schema";

type Doc = Record<string, unknown> & { id: string };

const QUERY_BY: Record<string, string> = {
  [ALBUMS_COLLECTION]: "title,artist",
  [ARTISTS_COLLECTION]: "name,biography",
  [TRACKS_COLLECTION]: "title,artist,albumArtist,album,composer",
  [USERS_COLLECTION]: "handle,displayName",
  [PLAYLISTS_COLLECTION]: "name,description",
};

export const SEARCH_COLLECTIONS = [
  ALBUMS_COLLECTION,
  ARTISTS_COLLECTION,
  TRACKS_COLLECTION,
  USERS_COLLECTION,
  PLAYLISTS_COLLECTION,
] as const;

async function upsertMany(collection: string, docs: Doc[]): Promise<void> {
  if (docs.length === 0) return;
  await withTypesenseRetry(() =>
    typesense
      .collections(collection)
      .documents()
      .import(docs, { action: "upsert" }),
  );
}

const toDoc = <T extends { id: string }>(row: T): Doc => row as unknown as Doc;

export async function indexAlbums(rows: SelectAlbum[]): Promise<void> {
  await upsertMany(ALBUMS_COLLECTION, rows.map(toDoc));
}

export async function indexArtists(rows: SelectArtist[]): Promise<void> {
  await upsertMany(ARTISTS_COLLECTION, rows.map(toDoc));
}

export async function indexTracks(rows: SelectTrack[]): Promise<void> {
  await upsertMany(TRACKS_COLLECTION, rows.map(toDoc));
}

export async function indexUsers(rows: SelectUser[]): Promise<void> {
  await upsertMany(USERS_COLLECTION, rows.map(toDoc));
}

export async function indexPlaylists(rows: SelectPlaylist[]): Promise<void> {
  await upsertMany(PLAYLISTS_COLLECTION, rows.map(toDoc));
}

export interface FederatedSearchResults {
  hits: Array<Record<string, unknown> & { _federation: { indexUid: string } }>;
  processingTimeMs: number;
  limit: number;
  offset: number;
  estimatedTotalHits: number;
}

export async function federatedSearch(
  query: string,
  perCollectionLimit = 20,
): Promise<FederatedSearchResults> {
  const searches = SEARCH_COLLECTIONS.map((collection) => ({
    collection,
    q: query,
    query_by: QUERY_BY[collection],
    per_page: perCollectionLimit,
    page: 1,
    prioritize_exact_match: true,
  }));

  const started = Date.now();
  const res = await typesense.multiSearch.perform<Doc[]>({ searches });
  const elapsed = Date.now() - started;

  const hits: FederatedSearchResults["hits"] = [];
  let estimatedTotalHits = 0;

  res.results.forEach((result, idx) => {
    const indexUid = SEARCH_COLLECTIONS[idx];
    const errored = (result as { error?: unknown }).error;
    if (!result || errored) return;
    estimatedTotalHits += result.found ?? 0;
    for (const h of result.hits ?? []) {
      hits.push({
        ...(h.document as Record<string, unknown>),
        _federation: { indexUid },
      });
    }
  });

  return {
    hits,
    processingTimeMs: elapsed,
    limit: perCollectionLimit * SEARCH_COLLECTIONS.length,
    offset: 0,
    estimatedTotalHits,
  };
}
