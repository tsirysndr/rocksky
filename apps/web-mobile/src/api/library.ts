/* eslint-disable @typescript-eslint/no-explicit-any */
// The `any` returns preserve the previous untyped axios `response.data`
// contract for existing consumers.
import { rocksky } from "../lib/rocksky";

export const getSongByUri = async (uri: string) => {
  if (uri.includes("app.rocksky.scrobble")) return null;
  const data = (await rocksky().song({ uri })) as any;
  return {
    id: data?.id,
    title: data?.title,
    artist: data?.artist,
    albumArtist: data?.albumArtist,
    album: data?.album,
    cover: data?.albumArt,
    tags: data?.tags,
    artistUri: data?.artistUri,
    albumUri: data?.albumUri,
    listeners: data?.uniqueListeners || 1,
    scrobbles: data?.playCount || 1,
    lyrics: data?.lyrics,
    spotifyLink: data?.spotifyLink,
    composer: data?.composer,
    uri: data?.uri,
    // A song's own URI is what liking needs; on a scrobble the raw response
    // carries a separate trackUri.
    trackUri: data?.uri,
    liked: data?.liked,
    artists: data?.artists,
    firstScrobble: data?.firstScrobble as
      | { handle: string; avatar: string; timestamp: string }
      | undefined,
  };
};

export const getArtistTracks = async (
  uri: string,
  limit = 10,
): Promise<any[]> => {
  return rocksky().artistTracks(uri, limit);
};

export const getArtistAlbums = async (
  uri: string,
  limit = 10,
): Promise<any[] | undefined> => {
  const data = (await rocksky().get("app.rocksky.artist.getArtistAlbums", {
    uri,
    limit,
  })) as { albums?: any[] };
  return data.albums;
};

export const getArtists = async (
  did: string,
  offset = 0,
  limit = 30,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  return rocksky().get("app.rocksky.actor.getActorArtists", {
    did,
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  });
};

export const getAlbums = async (
  did: string,
  offset = 0,
  limit = 12,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  return rocksky().get("app.rocksky.actor.getActorAlbums", {
    did,
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  });
};

export const getTracks = async (
  did: string,
  offset = 0,
  limit = 20,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  return rocksky().get("app.rocksky.actor.getActorSongs", {
    did,
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  });
};

export const getLovedTracks = async (
  did: string,
  offset = 0,
  limit = 20,
): Promise<any[]> => {
  return rocksky().lovedSongs(did, limit, offset);
};

export const getAlbum = async (did: string, rkey: string): Promise<any> => {
  return rocksky().album(`at://${did}/app.rocksky.album/${rkey}`);
};

export const getArtist = async (did: string, rkey: string): Promise<any> => {
  return rocksky().artist(`at://${did}/app.rocksky.artist/${rkey}`);
};

export const getArtistListeners = async (
  uri: string,
  limit: number,
): Promise<any> => {
  return rocksky().artistListeners(uri, limit);
};

export type RecentListener = {
  id: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  timestamp: string;
  scrobbleUri: string;
};

export const getArtistRecentListeners = async (
  uri: string,
  limit = 10,
): Promise<{ listeners: RecentListener[] }> => {
  const data = await rocksky().artistRecentListeners(uri, limit);
  return data as unknown as { listeners: RecentListener[] };
};

export const getSongRecentListeners = async (
  uri: string,
  limit = 10,
): Promise<{ listeners: RecentListener[] }> => {
  const data = await rocksky().songRecentListeners(uri, limit);
  return data as unknown as { listeners: RecentListener[] };
};

export const getTopArtists = async (
  offset = 0,
  limit = 20,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  return rocksky().get("app.rocksky.charts.getTopArtists", {
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  });
};

export const getTopTracks = async (
  offset = 0,
  limit = 20,
  startDate?: Date,
  endDate?: Date,
): Promise<any> => {
  return rocksky().get("app.rocksky.charts.getTopTracks", {
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  });
};
