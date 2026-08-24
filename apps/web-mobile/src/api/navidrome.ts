import type { LibraryPlaylistMutation } from "@rocksky/sdk";
import axios from "axios";
import { NAVIDROME_URL } from "../consts";
import { rocksky } from "../lib/rocksky";

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

export interface NavidromePlaylist {
  id: string;
  name: string;
  songCount: number;
  duration: number; // seconds
  comment?: string;
  coverArt?: string;
  entry?: NavidromeSong[];
  /** AT-URI of the app.rocksky.playlist record this playlist is mirrored to. */
  uri?: string;
  /** Album art of up to four of its tracks, oldest first, for the cover mosaic. */
  trackArts?: string[];
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

const asArray = <T>(v: T | T[] | undefined): T[] =>
  Array.isArray(v) ? v : v ? [v] : [];

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

// -- Playlists ---------------------------------------------------------------

export async function fetchNavidromePlaylists(
  creds: NavidromeCredentials,
): Promise<NavidromePlaylist[]> {
  const res = await axios.get(restUrl("getPlaylists"), { params: qp(creds) });
  return asArray<NavidromePlaylist>(
    (sr(res.data)?.playlists as { playlist?: NavidromePlaylist | NavidromePlaylist[] })?.playlist,
  );
}

export async function fetchNavidromePlaylist(
  creds: NavidromeCredentials,
  id: string,
): Promise<NavidromePlaylist> {
  const res = await axios.get(restUrl("getPlaylist"), { params: qp(creds, { id }) });
  const pl = sr(res.data)?.playlist as NavidromePlaylist;
  return { ...pl, entry: asArray<NavidromeSong>(pl?.entry) };
}

// Reads talk to navidrome directly; writes go through the Rocksky API instead.
// It runs the same navidrome call and then mirrors the change onto the user's
// PDS as an app.rocksky.playlist record — going direct would skip the mirror
// and silently drift the repo from the library.

/** A mirror failure: the library change stuck, the PDS record didn't. */
export class PlaylistMirrorWarning extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaylistMirrorWarning";
  }
}

function throwIfMirrorFailed(result: LibraryPlaylistMutation) {
  if (result.atprotoError) throw new PlaylistMirrorWarning(result.atprotoError);
}

export async function createNavidromePlaylist(input: {
  name: string;
  description?: string;
  songIds?: string[];
}): Promise<string | undefined> {
  const res = await rocksky().library().createPlaylist(input.name);
  const id = res.playlist?.id;
  if (!id) {
    throwIfMirrorFailed(res);
    return id;
  }

  // Subsonic's createPlaylist takes a name and nothing else, so the
  // description is a follow-up update. It also republishes the record if
  // creation missed it, which is why the create-time error isn't raised yet.
  const followUps: (() => Promise<void>)[] = [];
  if (input.description) {
    followUps.push(() =>
      setNavidromePlaylistDescription(id, input.description as string),
    );
  }
  for (const songId of input.songIds ?? []) {
    followUps.push(() => addTrackToNavidromePlaylist(id, songId));
  }
  if (followUps.length === 0) {
    throwIfMirrorFailed(res);
    return id;
  }
  // Awaited one at a time on purpose: navidrome appends tracks in call order,
  // so firing them together would scramble the playlist.
  for (const followUp of followUps) await followUp();
  return id;
}

export async function setNavidromePlaylistDescription(
  playlistId: string,
  description: string,
): Promise<void> {
  throwIfMirrorFailed(
    await rocksky().library().updatePlaylist(playlistId, { comment: description }),
  );
}

export async function deleteNavidromePlaylist(id: string): Promise<void> {
  throwIfMirrorFailed(await rocksky().library().deletePlaylist(id));
}

export async function renameNavidromePlaylist(
  playlistId: string,
  name: string,
): Promise<void> {
  throwIfMirrorFailed(
    await rocksky().library().updatePlaylist(playlistId, { name }),
  );
}

export async function addTrackToNavidromePlaylist(
  playlistId: string,
  songId: string,
): Promise<void> {
  throwIfMirrorFailed(
    await rocksky().library().updatePlaylist(playlistId, { songIdToAdd: songId }),
  );
}

export async function removeTrackFromNavidromePlaylist(
  playlistId: string,
  index: number,
): Promise<void> {
  throwIfMirrorFailed(
    await rocksky()
      .library()
      .updatePlaylist(playlistId, { songIndexToRemove: index }),
  );
}
