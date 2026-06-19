import axios from "axios";
import { NAVIDROME_URL } from "../consts";

const V = "1.16.1";
const C = "rocksky";

export interface NavidromeCredentials {
  handle: string;
  apiKey: string;
}

export interface NavidromeSong {
  id: string;
  title: string;
  artist: string;
  albumArtist?: string;
  album: string;
  duration: number; // seconds
  coverArt?: string;
  albumId?: string;
  artistId?: string;
  track?: number;
  genre?: string;
}

export interface NavidromeAlbum {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  songCount: number;
  duration: number; // seconds
  year?: number;
  coverArt?: string;
  _coverArtUrl?: string;
  song?: NavidromeSong[];
}

export interface NavidromeArtist {
  id: string;
  name: string;
  albumCount: number;
  artistImageUrl?: string;
  coverArt?: string;
  album?: NavidromeAlbum[];
}

function qp(creds: NavidromeCredentials, extra?: Record<string, string | number>) {
  return { u: creds.handle, p: creds.apiKey, v: V, c: C, f: "json", ...extra };
}

function restUrl(method: string) {
  return `${NAVIDROME_URL}/rest/${method}`;
}

function sr(data: unknown) {
  return (data as Record<string, unknown>)["subsonic-response"] as Record<string, unknown>;
}

export function getCoverArtUrl(creds: NavidromeCredentials, id: string): string {
  const p = new URLSearchParams({ u: creds.handle, p: creds.apiKey, v: V, c: C, id });
  return `${NAVIDROME_URL}/rest/getCoverArt?${p}`;
}

export function getNavidromeStreamUrl(creds: NavidromeCredentials, songId: string): string {
  // format=raw makes Navidrome serve the original file bytes (no transcoding,
  // proper atomized MP4 with mdat). Without it, /rest/stream returns a
  // fragmented MP4 that rockbox's MP4 demuxer can't parse — see
  // "Failed to find mdat atom" in rockboxd logs.
  const p = new URLSearchParams({
    u: creds.handle,
    p: creds.apiKey,
    v: V,
    c: C,
    id: songId,
    format: "raw",
  });
  return `${NAVIDROME_URL}/rest/stream?${p}`;
}

export async function fetchNavidromeAlbums(
  creds: NavidromeCredentials,
  offset = 0,
  size = 50,
  type = "newest",
): Promise<NavidromeAlbum[]> {
  const res = await axios.get(restUrl("getAlbumList2"), {
    params: qp(creds, { type, size, offset }),
  });
  return (sr(res.data)?.albumList2 as { album?: NavidromeAlbum[] })?.album ?? [];
}

export async function fetchNavidromeArtists(
  creds: NavidromeCredentials,
): Promise<NavidromeArtist[]> {
  const res = await axios.get(restUrl("getArtists"), { params: qp(creds) });
  const indexes = (sr(res.data)?.artists as { index?: { artist: NavidromeArtist[] }[] })?.index ?? [];
  return indexes.flatMap((idx) => idx.artist ?? []);
}

export async function fetchNavidromeAlbum(
  creds: NavidromeCredentials,
  albumId: string,
): Promise<NavidromeAlbum> {
  const res = await axios.get(restUrl("getAlbum"), { params: qp(creds, { id: albumId }) });
  return sr(res.data)?.album as NavidromeAlbum;
}

export async function fetchNavidromeArtist(
  creds: NavidromeCredentials,
  artistId: string,
): Promise<NavidromeArtist> {
  const res = await axios.get(restUrl("getArtist"), { params: qp(creds, { id: artistId }) });
  return sr(res.data)?.artist as NavidromeArtist;
}

export interface NavidromeSearchResult {
  songs: NavidromeSong[];
  albums: NavidromeAlbum[];
  artists: NavidromeArtist[];
}

export async function searchNavidrome(
  creds: NavidromeCredentials,
  query: string,
  opts?: {
    songOffset?: number;
    songCount?: number;
    albumOffset?: number;
    albumCount?: number;
    artistOffset?: number;
    artistCount?: number;
  },
): Promise<NavidromeSearchResult> {
  const res = await axios.get(restUrl("search3"), {
    params: qp(creds, {
      query,
      songCount: opts?.songCount ?? 50,
      songOffset: opts?.songOffset ?? 0,
      albumCount: opts?.albumCount ?? 50,
      albumOffset: opts?.albumOffset ?? 0,
      artistCount: opts?.artistCount ?? 50,
      artistOffset: opts?.artistOffset ?? 0,
    }),
  });
  const result = sr(res.data)?.searchResult3 as {
    song?: NavidromeSong[];
    album?: NavidromeAlbum[];
    artist?: NavidromeArtist[];
  };
  return {
    songs: result?.song ?? [],
    albums: result?.album ?? [],
    artists: result?.artist ?? [],
  };
}
