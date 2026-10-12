import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

export type LibraryKind = "navidrome" | "jellyfin" | "upnp" | "plyr";
export type LibrarySource = {
  id: string;
  kind: LibraryKind;
  name: string;
  baseUrl: string;
  username: string;
};
export type LibraryConnection = Omit<LibrarySource, "id"> & {
  id?: string;
  password?: string;
  token?: string;
};
export type LibraryEntry = {
  artistHandle?: string;
  id: string;
  title: string;
  kind: string;
  artist: string;
  album: string;
  durationMs: number;
  art: string | null;
};
export type LibraryPage = {
  entries: LibraryEntry[];
  nextOffset: number | null;
};

export const PLYR_ID = "plyr.fm";
export const PLYR_API = "https://api.plyr.fm";
export const plyrTabs = ["Tracks", "Top tracks", "Albums", "Artists", "Radio"];

export const libraryProviders = [
  {
    kind: "plyr",
    title: "plyr.fm",
    hint: "Discover independent music and radio",
    placeholder: PLYR_API,
  },
  {
    kind: "navidrome",
    title: "Navidrome / Subsonic",
    hint: "Your personal music server",
    placeholder: "https://music.example.com",
  },
  {
    kind: "jellyfin",
    title: "Jellyfin",
    hint: "Your Jellyfin music collection",
    placeholder: "http://192.168.1.10:8096",
  },
  {
    kind: "upnp",
    title: "UPnP / DLNA",
    hint: "Find media servers on your network",
    placeholder: "http://192.168.1.10:8200/rootDesc.xml",
  },
] as const satisfies readonly {
  kind: LibraryKind;
  title: string;
  hint: string;
  placeholder: string;
}[];

export function plyrDisplayLabel(value: string, handle?: string): string {
  if (!handle) return value;
  const bare = handle.replace(/^@+/, "");
  return value.replace(/^@+/, "") === bare ? `@${bare}` : value;
}

function request<T>(request: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject(new Error("Remote libraries need the desktop app."));
  return invoke<T>("remote_library", { request }).catch((e) => {
    throw new Error(typeof e === "string" ? e : "Library request failed");
  });
}

export const remoteLibraries = {
  list: () => request<{ sources: LibrarySource[] }>({ cmd: "list" }),
  save: (config: LibraryConnection) =>
    request<{ source: LibrarySource }>({ cmd: "save", config }),
  connectPlyr: () =>
    remoteLibraries.save({
      kind: "plyr",
      name: "plyr.fm",
      baseUrl: PLYR_API,
      username: "",
    }),
  remove: (sourceId: string) => request({ cmd: "remove", sourceId }),
  discover: () =>
    request<{ devices: LibrarySource[] }>({ cmd: "discover", kind: "upnp" }),
  browse: (sourceId: string, id: string, query: string, offset: number) =>
    request<LibraryPage>({
      cmd: "browse",
      sourceId,
      id,
      query,
      offset,
      limit: 100,
    }),
  stream: async (sourceId: string, id: string) =>
    (await request<{ url: string }>({ cmd: "stream", sourceId, id })).url,
};
