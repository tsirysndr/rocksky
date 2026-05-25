import { typesense } from "./client";
import { LIBRARY_TRACKS_COLLECTION } from "./schema";

export interface LibraryTrackDocument {
  id: string;
  user_id: string;
  track_id: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  genre?: string;
  composer?: string;
  year?: number;
  duration: number;
  album_art?: string;
  r2_key: string;
  mime_type: string;
  file_size: number;
  original_filename?: string;
  uploaded_at: number;
  mb_id?: string;
  track_number?: number;
  disc_number?: number;
}

export async function indexLibraryTrack(doc: LibraryTrackDocument): Promise<void> {
  await typesense.collections(LIBRARY_TRACKS_COLLECTION).documents().upsert(doc);
}

export async function removeLibraryTrack(uploadId: string): Promise<void> {
  try {
    await typesense
      .collections(LIBRARY_TRACKS_COLLECTION)
      .documents(uploadId)
      .delete();
  } catch (e: any) {
    if (e?.httpStatus !== 404) throw e;
  }
}

export interface SearchLibraryParams {
  query: string;
  userId: string;
  limit?: number;
  offset?: number;
}

export async function searchLibraryTracks(params: SearchLibraryParams) {
  const { query, userId, limit = 50, offset = 0 } = params;
  const perPage = Math.min(limit, 200);
  const page = Math.floor(offset / perPage) + 1;

  const result = await typesense
    .collections(LIBRARY_TRACKS_COLLECTION)
    .documents()
    .search({
      q: query || "*",
      query_by: "title,artist,album,album_artist,genre,composer",
      filter_by: `user_id:=${userId}`,
      per_page: perPage,
      page,
      sort_by: query ? "_text_match:desc,uploaded_at:desc" : "uploaded_at:desc",
    });

  return (result.hits ?? []).map((hit) => {
    const doc = hit.document as LibraryTrackDocument;
    return {
      upload: {
        id: doc.id,
        userId: doc.user_id,
        trackId: doc.track_id,
        r2Key: doc.r2_key,
        mimeType: doc.mime_type,
        fileSize: doc.file_size,
        originalFilename: doc.original_filename ?? null,
        uploadedAt: new Date(doc.uploaded_at),
      },
      track: {
        id: doc.track_id,
        title: doc.title,
        artist: doc.artist,
        albumArtist: doc.album_artist,
        album: doc.album,
        duration: doc.duration,
        genre: doc.genre ?? null,
        composer: doc.composer ?? null,
        albumArt: doc.album_art ?? null,
        trackNumber: doc.track_number ?? null,
        discNumber: doc.disc_number ?? null,
        mbId: doc.mb_id ?? null,
        year: doc.year ?? null,
      },
      albumReleaseDate: null,
      albumYear: doc.year ?? null,
    };
  });
}
