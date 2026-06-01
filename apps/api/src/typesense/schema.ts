import { consola } from "consola";
import type { CollectionFieldSchema } from "typesense/lib/Typesense/Collection";
import type { BaseCollectionCreateSchema } from "typesense/lib/Typesense/Collections";
import { typesense } from "./client";

type SearchCollectionSchema = BaseCollectionCreateSchema & {
  fields: CollectionFieldSchema[];
};

export const LIBRARY_TRACKS_COLLECTION = "library_tracks";

export const ALBUMS_COLLECTION = "albums";
export const ARTISTS_COLLECTION = "artists";
export const TRACKS_COLLECTION = "tracks";
export const USERS_COLLECTION = "users";
export const PLAYLISTS_COLLECTION = "playlists";

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

const SEARCH_COLLECTION_SCHEMAS: SearchCollectionSchema[] = [
  {
    name: ALBUMS_COLLECTION,
    enable_nested_fields: true,
    fields: [
      { name: "id", type: "string" },
      { name: "title", type: "string", optional: true },
      { name: "artist", type: "string", optional: true },
      { name: "year", type: "int32", optional: true, facet: true },
      { name: ".*", type: "auto" },
    ],
  },
  {
    name: ARTISTS_COLLECTION,
    enable_nested_fields: true,
    fields: [
      { name: "id", type: "string" },
      { name: "name", type: "string", optional: true },
      { name: "biography", type: "string", optional: true },
      { name: "genres", type: "string[]", optional: true, facet: true },
      { name: "bornIn", type: "string", optional: true },
      { name: ".*", type: "auto" },
    ],
  },
  {
    name: TRACKS_COLLECTION,
    enable_nested_fields: true,
    fields: [
      { name: "id", type: "string" },
      { name: "title", type: "string", optional: true },
      { name: "artist", type: "string", optional: true },
      { name: "albumArtist", type: "string", optional: true },
      { name: "album", type: "string", optional: true },
      { name: "genre", type: "string", optional: true, facet: true },
      { name: "composer", type: "string", optional: true },
      { name: ".*", type: "auto" },
    ],
  },
  {
    name: USERS_COLLECTION,
    enable_nested_fields: true,
    fields: [
      { name: "id", type: "string" },
      { name: "handle", type: "string", optional: true },
      { name: "displayName", type: "string", optional: true },
      { name: ".*", type: "auto" },
    ],
  },
  {
    name: PLAYLISTS_COLLECTION,
    enable_nested_fields: true,
    fields: [
      { name: "id", type: "string" },
      { name: "name", type: "string", optional: true },
      { name: "description", type: "string", optional: true },
      { name: ".*", type: "auto" },
    ],
  },
];

export async function ensureSearchCollections(): Promise<void> {
  for (const schema of SEARCH_COLLECTION_SCHEMAS) {
    try {
      await typesense.collections(schema.name).retrieve();
    } catch {
      consola.info(`[typesense] creating ${schema.name} collection`);
      await typesense.collections().create(schema);
      consola.info(`[typesense] ${schema.name} collection created`);
    }
  }
}

export async function recreateSearchCollections(): Promise<void> {
  for (const schema of SEARCH_COLLECTION_SCHEMAS) {
    try {
      await typesense.collections(schema.name).delete();
      consola.info(`[typesense] dropped ${schema.name} collection`);
    } catch (e: any) {
      if (e?.httpStatus !== 404) throw e;
    }
    await typesense.collections().create(schema);
    consola.info(`[typesense] ${schema.name} collection created`);
  }
}
