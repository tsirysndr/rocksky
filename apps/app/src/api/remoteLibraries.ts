import { remoteLibraryRequest } from "../../modules/rocksky-engine";

export type LibraryKind = "navidrome" | "jellyfin" | "upnp" | "kodi" | "plex";
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
  id: string;
  title: string;
  kind: string;
  artist: string;
  album: string;
  durationMs: number;
  art: string | null;
};
export type RemoteTrackMetadata = {
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  durationMs: number;
  albumArt: string | null;
  artistPicture?: string | null;
  artistLookupAt?: number;
  artworkLookupAt?: number;
  genre?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  [key: string]: unknown;
};
export type LibraryPage = {
  entries: LibraryEntry[];
  nextOffset: number | null;
};
export const libraryProviders = [
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
    hint: "Find media servers on your Wi-Fi",
    placeholder: "http://192.168.1.10:8200/rootDesc.xml",
  },
  {
    kind: "kodi",
    title: "Kodi",
    hint: "Connect through Kodi’s web server",
    placeholder: "http://192.168.1.10:8080",
  },
  {
    kind: "plex",
    title: "Plex",
    hint: "Your Plex music libraries",
    placeholder: "http://192.168.1.10:32400",
  },
] as const;
export type PlaylistItem = {
  id: string;
  entryId: string;
  removable?: boolean;
  title: string;
  artist: string;
  position: number;
};
export const remoteLibraries = {
  playlistCapabilities: (sourceId: string) =>
    remoteLibraryRequest<{
      create: boolean;
      rename: boolean;
      delete: boolean;
      items: boolean;
      move: boolean;
      add: boolean;
    }>({ cmd: "playlistOperation", sourceId, operation: "capabilities" }),
  writablePlaylists: (sourceId: string, id = "", offset = 0) =>
    remoteLibraryRequest<LibraryPage>({
      cmd: "writablePlaylists",
      sourceId,
      id,
      offset,
    }),
  addToPlaylist: (sourceId: string, playlistId: string, id: string) =>
    remoteLibraryRequest({ cmd: "addToPlaylist", sourceId, playlistId, id }),
  playlistOperation: (
    sourceId: string,
    operation: string,
    params: Record<string, unknown> = {},
  ) =>
    remoteLibraryRequest<{
      playlistId?: string;
      entries: PlaylistItem[];
      nextOffset: number | null;
    }>({ cmd: "playlistOperation", sourceId, operation, ...params }),
  metadata: async (
    sourceId: string,
    id: string,
    seed: Record<string, unknown>,
  ) =>
    (
      await remoteLibraryRequest<{ metadata: RemoteTrackMetadata }>({
        cmd: "metadata",
        sourceId,
        id,
        seed,
      })
    ).metadata,
  cacheArtwork: async (
    sourceId: string,
    id: string,
    artist: string,
    artistUrl = "",
    albumUrl = "",
  ) =>
    (
      await remoteLibraryRequest<{ metadata: RemoteTrackMetadata }>({
        cmd: "cacheArtwork",
        sourceId,
        id,
        artist,
        artistUrl,
        albumUrl,
      })
    ).metadata,
  list: () =>
    remoteLibraryRequest<{ sources: LibrarySource[] }>({ cmd: "list" }),
  save: (config: LibraryConnection) =>
    remoteLibraryRequest<{ source: LibrarySource }>({ cmd: "save", config }),
  remove: (sourceId: string) =>
    remoteLibraryRequest({ cmd: "remove", sourceId }),
  discover: (kind: "upnp" | "kodi") =>
    remoteLibraryRequest<{ devices: LibrarySource[] }>({
      cmd: "discover",
      kind,
    }),
  browse: (sourceId: string, id: string, query: string, offset: number) =>
    remoteLibraryRequest<LibraryPage>({
      cmd: "browse",
      sourceId,
      id,
      query,
      offset,
      limit: 100,
    }),
  stream: async (sourceId: string, id: string) =>
    (
      await remoteLibraryRequest<{ url: string }>({
        cmd: "stream",
        sourceId,
        id,
      })
    ).url,
};
