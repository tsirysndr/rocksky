// Typed shape of the federated search response from
// GET /xrpc/app.rocksky.feed.search. Each hit is a raw index document tagged
// with the collection it came from via `_federation.indexUid`.

export type SearchIndex =
  | "users"
  | "artists"
  | "albums"
  | "tracks"
  | "playlists";

type Federation<T extends SearchIndex> = { _federation: { indexUid: T } };

export type UserHit = Federation<"users"> & {
  id: string;
  did: string;
  handle: string;
  displayName: string | null;
  avatar: string;
};

export type ArtistHit = Federation<"artists"> & {
  id: string;
  name: string;
  picture: string | null;
  uri: string | null;
};

export type AlbumHit = Federation<"albums"> & {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  uri: string | null;
};

export type TrackHit = Federation<"tracks"> & {
  id: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  albumArt: string | null;
  uri: string | null;
};

export type PlaylistHit = Federation<"playlists"> & {
  id: string;
  name: string;
  picture: string | null;
  uri: string | null;
};

export type SearchHit =
  | UserHit
  | ArtistHit
  | AlbumHit
  | TrackHit
  | PlaylistHit;

export interface SearchResponse {
  hits: SearchHit[];
  processingTimeMs: number;
  limit: number;
  offset: number;
  estimatedTotalHits: number;
}

// Type guards — the discriminant lives on the nested `_federation.indexUid`,
// which TS can't narrow through a plain switch, so narrow explicitly.
export const isUserHit = (h: SearchHit): h is UserHit =>
  h._federation.indexUid === "users";
export const isArtistHit = (h: SearchHit): h is ArtistHit =>
  h._federation.indexUid === "artists";
export const isAlbumHit = (h: SearchHit): h is AlbumHit =>
  h._federation.indexUid === "albums";
export const isTrackHit = (h: SearchHit): h is TrackHit =>
  h._federation.indexUid === "tracks";
export const isPlaylistHit = (h: SearchHit): h is PlaylistHit =>
  h._federation.indexUid === "playlists";
