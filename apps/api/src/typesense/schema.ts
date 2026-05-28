import { consola } from "consola";
import { typesense } from "./client";

export const LIBRARY_TRACKS_COLLECTION = "library_tracks";

export async function ensureCollection(): Promise<void> {
  try {
    await typesense.collections(LIBRARY_TRACKS_COLLECTION).retrieve();
  } catch {
    consola.info("[typesense] creating library_tracks collection");
    await typesense.collections().create({
      name: LIBRARY_TRACKS_COLLECTION,
      fields: [
        { name: "id", type: "string" as const },
        { name: "user_id", type: "string" as const, facet: true },
        { name: "track_id", type: "string" as const, index: false },
        { name: "title", type: "string" as const },
        { name: "artist", type: "string" as const },
        { name: "album", type: "string" as const },
        { name: "album_artist", type: "string" as const },
        { name: "genre", type: "string" as const, optional: true },
        { name: "composer", type: "string" as const, optional: true },
        { name: "year", type: "int32" as const, optional: true },
        { name: "duration", type: "int32" as const },
        {
          name: "album_art",
          type: "string" as const,
          optional: true,
          index: false,
        },
        { name: "r2_key", type: "string" as const, index: false },
        { name: "mime_type", type: "string" as const, index: false },
        { name: "file_size", type: "int32" as const, index: false },
        {
          name: "original_filename",
          type: "string" as const,
          optional: true,
          index: false,
        },
        { name: "uploaded_at", type: "int64" as const },
        { name: "mb_id", type: "string" as const, optional: true },
        { name: "track_number", type: "int32" as const, optional: true },
        { name: "disc_number", type: "int32" as const, optional: true },
      ],
      default_sorting_field: "uploaded_at",
    });
    consola.info("[typesense] library_tracks collection created");
  }
}
