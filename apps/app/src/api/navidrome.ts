import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";

// Browsing the user's library goes straight to navidrome's Subsonic API, the
// same way the web clients do. The /uploads/albums and /uploads/artists
// endpoints group-by the whole upload set on every page, which is why the
// native tabs used to take seconds where the web ones are instant.

// Not user configuration: the deployment is fixed, like the rest of the
// project's tooling.
export const NAVIDROME_URL = "https://navidrome.rocksky.app";

const V = "1.16.1";
const C = "rocksky";

export type NavidromeCredentials = {
  handle: string;
  apiKey: string;
};

export type NavidromeSong = {
  id: string;
  title: string;
  artist: string;
  albumArtist?: string;
  album: string;
  /** Seconds, unlike the uploads API's milliseconds. */
  duration: number;
  coverArt?: string;
  /** Public CDN URL for the art — render this, never a getCoverArt link. */
  coverArtUrl?: string;
  albumId?: string;
  artistId?: string;
  track?: number;
  discNumber?: number;
  genre?: string;
  /** Present when the track was tagged with one; the only id that ties a
   * navidrome song back to its Rocksky record, which has no Subsonic field. */
  musicBrainzId?: string;
};

export type NavidromeAlbum = {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  songCount: number;
  /** Seconds. */
  duration: number;
  year?: number;
  coverArt?: string;
  /** Public CDN URL for the art — render this, never a getCoverArt link. */
  coverArtUrl?: string;
  /**
   * The same URL under the name getArtist uses for its nested albums. Reading
   * only `coverArtUrl` is why an artist's albums rendered with no art at all.
   */
  _coverArtUrl?: string;
  song?: NavidromeSong[];
};

export type NavidromeArtist = {
  id: string;
  name: string;
  albumCount: number;
  artistImageUrl?: string;
  coverArt?: string;
  /** Public CDN URL for the art — render this, never a getCoverArt link. */
  coverArtUrl?: string;
  album?: NavidromeAlbum[];
};

export type NavidromeSearchResult = {
  songs: NavidromeSong[];
  albums: NavidromeAlbum[];
  artists: NavidromeArtist[];
};

type SubsonicStatus = {
  status: string;
  version: string;
};

type SubsonicEnvelope<T> = {
  "subsonic-response": SubsonicStatus & T;
};

type AlbumList2Body = { albumList2?: { album?: NavidromeAlbum[] } };
type ArtistsBody = {
  artists?: { index?: { name?: string; artist?: NavidromeArtist[] }[] };
};
type AlbumBody = { album?: NavidromeAlbum };
type ArtistBody = { artist?: NavidromeArtist };
type SearchResult3Body = {
  searchResult3?: {
    song?: NavidromeSong[];
    album?: NavidromeAlbum[];
    artist?: NavidromeArtist[];
  };
};

const commonParams = (
  creds: NavidromeCredentials,
  extra?: Record<string, string | number>,
): Record<string, string | number> => ({
  u: creds.handle,
  p: creds.apiKey,
  v: V,
  c: C,
  f: "json",
  ...extra,
});

const restUrl = (method: string) => `${NAVIDROME_URL}/rest/${method}`;

async function subsonicGet<T>(
  method: string,
  creds: NavidromeCredentials,
  extra?: Record<string, string | number>,
): Promise<SubsonicStatus & T> {
  const response = await axios.get<SubsonicEnvelope<T>>(restUrl(method), {
    params: commonParams(creds, extra),
  });
  return response.data["subsonic-response"];
}

/** navidrome sends "" rather than omitting the field when there is no art. */
const nonEmpty = (value?: string | null): string | null =>
  value && value.trim().length > 0 ? value : null;

/**
 * The art to render for an entity.
 *
 * Always the CDN URL the server publishes: building a /rest/getCoverArt link
 * instead would put the user's API key into every image request for a picture
 * that is public anyway.
 *
 * The server spells that URL `coverArtUrl` everywhere except the albums nested
 * in a getArtist response, where it is `_coverArtUrl`, so both are read.
 */
export const coverArtUrlOf = (
  entity?: { coverArtUrl?: string | null; _coverArtUrl?: string | null } | null,
): string | null =>
  nonEmpty(entity?.coverArtUrl) ?? nonEmpty(entity?._coverArtUrl);

/** An artist's picture, falling back to its cover art. */
export const artistArtUrlOf = (
  artist?: Pick<NavidromeArtist, "artistImageUrl" | "coverArtUrl"> | null,
): string | null => nonEmpty(artist?.artistImageUrl) ?? coverArtUrlOf(artist);

/**
 * Keyed on the Subsonic id, which is stable and unique — unlike names or the
 * AT-URIs the uploads aggregate returned, which collide.
 */
export const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

/**
 * format=raw makes navidrome serve the original file bytes with no
 * transcoding, which is what the native engine's demuxers expect.
 */
export const navidromeStreamUrl = (
  songId: string,
  creds: NavidromeCredentials,
): string => {
  const params = new URLSearchParams({
    u: creds.handle,
    p: creds.apiKey,
    v: V,
    c: C,
    id: songId,
    format: "raw",
  });
  return `${NAVIDROME_URL}/rest/stream?${params.toString()}`;
};

export const fetchNavidromeAlbums = async (
  creds: NavidromeCredentials,
  offset = 0,
  size = 50,
  type = "newest",
): Promise<NavidromeAlbum[]> => {
  const body = await subsonicGet<AlbumList2Body>("getAlbumList2", creds, {
    type,
    size,
    offset,
  });
  return body.albumList2?.album ?? [];
};

/** One unpaged call: getArtists hands back the whole index. */
export const fetchNavidromeArtists = async (
  creds: NavidromeCredentials,
): Promise<NavidromeArtist[]> => {
  const body = await subsonicGet<ArtistsBody>("getArtists", creds);
  return (body.artists?.index ?? []).flatMap((index) => index.artist ?? []);
};

export const fetchNavidromeAlbum = async (
  creds: NavidromeCredentials,
  albumId: string,
): Promise<NavidromeAlbum | null> => {
  const body = await subsonicGet<AlbumBody>("getAlbum", creds, { id: albumId });
  return body.album ?? null;
};

export const fetchNavidromeArtist = async (
  creds: NavidromeCredentials,
  artistId: string,
): Promise<NavidromeArtist | null> => {
  const body = await subsonicGet<ArtistBody>("getArtist", creds, {
    id: artistId,
  });
  return body.artist ?? null;
};

// Subsonic's star/unstar is a real love: the server marks the track and
// publishes the app.rocksky.like record, the same as the REST like endpoint.
// It is the only like path for a navidrome song, which carries no AT-URI.

export const starNavidromeSong = async (
  creds: NavidromeCredentials,
  songId: string,
): Promise<void> => {
  await subsonicGet<Record<string, never>>("star", creds, { id: songId });
};

export const unstarNavidromeSong = async (
  creds: NavidromeCredentials,
  songId: string,
): Promise<void> => {
  await subsonicGet<Record<string, never>>("unstar", creds, { id: songId });
};

type Starred2Body = { starred2?: { song?: NavidromeSong[] } };

/** Ids of the songs the user has loved, for the heart's initial state. */
export const fetchStarredSongIds = async (
  creds: NavidromeCredentials,
): Promise<Set<string>> => {
  const body = await subsonicGet<Starred2Body>("getStarred2", creds);
  const songs = body.starred2?.song;
  const list = Array.isArray(songs) ? songs : songs ? [songs] : [];
  return new Set(list.map((song) => song.id));
};

export type NavidromeSearchOptions = {
  songOffset?: number;
  songCount?: number;
  albumOffset?: number;
  albumCount?: number;
  artistOffset?: number;
  artistCount?: number;
};

export const searchNavidrome = async (
  creds: NavidromeCredentials,
  query: string,
  opts: NavidromeSearchOptions = {},
): Promise<NavidromeSearchResult> => {
  const body = await subsonicGet<SearchResult3Body>("search3", creds, {
    query,
    songCount: opts.songCount ?? 50,
    songOffset: opts.songOffset ?? 0,
    albumCount: opts.albumCount ?? 50,
    albumOffset: opts.albumOffset ?? 0,
    artistCount: opts.artistCount ?? 50,
    artistOffset: opts.artistOffset ?? 0,
  });
  const result = body.searchResult3;
  return {
    songs: result?.song ?? [],
    albums: result?.album ?? [],
    artists: result?.artist ?? [],
  };
};

// -- Credentials -------------------------------------------------------------

export type ApiKey = {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
  sharedSecret: string;
  enabled: boolean;
  createdAt: string;
};

export const NAVIDROME_KEY_NAME = "navidrome";

const authHeaders = () => ({
  authorization: `Bearer ${storage.getToken()}`,
});

export const getApiKeys = async (offset = 0, size = 100): Promise<ApiKey[]> => {
  const response = await axios.get<ApiKey[]>(`${API_URL}/apikeys`, {
    headers: authHeaders(),
    params: { offset, size },
  });
  return response.data;
};

export const createApiKey = async (
  name: string,
  description?: string,
): Promise<ApiKey> => {
  const response = await axios.post<ApiKey>(
    `${API_URL}/apikeys`,
    { name, description },
    { headers: authHeaders() },
  );
  return response.data;
};

/**
 * The key navidrome authenticates the user with, minted on first use.
 *
 * Subsonic has no notion of the app's session JWT, so browsing needs a
 * long-lived key; the web clients reuse the one named "navidrome" and create
 * it only when the account has none.
 */
export const resolveNavidromeApiKey = async (): Promise<string> => {
  const keys = await getApiKeys(0, 100);
  const existing = keys.find((k) => k.name === NAVIDROME_KEY_NAME && k.enabled);
  if (existing) return existing.apiKey;
  const created = await createApiKey(
    NAVIDROME_KEY_NAME,
    "Navidrome API access",
  );
  return created.apiKey;
};
