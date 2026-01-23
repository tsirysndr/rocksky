import { client } from ".";
import { Album } from "../types/album";
import { Artist } from "../types/artist";
import { Track } from "../types/track";

export const getSongByUri = async (uri: string) => {
  if (uri.includes("app.rocksky.scrobble")) {
    return null;
  }

  const response = await client.get("/xrpc/app.rocksky.song.getSong", {
    params: { uri },
  });
  return {
    id: response.data?.id,
    title: response.data?.title,
    artist: response.data?.artist,
    albumArtist: response.data?.albumArtist,
    album: response.data?.album,
    cover: response.data?.albumArt,
    tags: response.data?.tags,
    artistUri: response.data?.artistUri,
    albumUri: response.data?.albumUri,
    listeners: response.data?.uniqueListeners || 1,
    scrobbles: response.data?.playCount || 1,
    lyrics: response.data?.lyrics,
    spotifyLink: response.data?.spotifyLink,
    composer: response.data?.composer,
    uri: response.data?.uri,
  };
};

export const getArtistTracks = async (
  uri: string,
  limit = 10,
): Promise<
  {
    id: string;
    title: string;
    artist: string;
    albumArtist: string;
    albumArt: string;
    uri: string;
    playCount: number;
    albumUri?: string;
    artistUri?: string;
  }[]
> => {
  const response = await client.get(
    "/xrpc/app.rocksky.artist.getArtistTracks",
    { params: { uri, limit } },
  );
  return response.data.tracks;
};

export const getArtistAlbums = async (
  uri: string,
  limit = 10,
): Promise<
  {
    id: string;
    title: string;
    artist: string;
    albumArt: string;
    artistUri: string;
    uri: string;
  }[]
> => {
  const response = await client.get(
    "/xrpc/app.rocksky.artist.getArtistAlbums",
    { params: { uri, limit } },
  );
  return response.data.albums;
};

export const getArtists = async (
  did: string,
  offset = 0,
  limit = 30,
  startDate?: Date,
  endDate?: Date,
) => {
  const response = await client.get<{ artists: Artist[] }>(
    "/xrpc/app.rocksky.actor.getActorArtists",
    {
      params: {
        did,
        limit,
        offset,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      },
    },
  );
  return response.data;
};

export const getAlbums = async (
  did: string,
  offset = 0,
  limit = 12,
  startDate?: Date,
  endDate?: Date,
) => {
  const response = await client.get("/xrpc/app.rocksky.actor.getActorAlbums", {
    params: {
      did,
      limit,
      offset,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
    },
  });
  return response.data;
};

export const getTracks = async (
  did: string,
  offset = 0,
  limit = 20,
  startDate?: Date,
  endDate?: Date,
) => {
  const response = await client.get("/xrpc/app.rocksky.actor.getActorSongs", {
    params: {
      did,
      limit,
      offset,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
    },
  });
  return response.data;
};

export const getLovedTracks = async (did: string, offset = 0, limit = 20) => {
  const response = await client.get(
    "/xrpc/app.rocksky.actor.getActorLovedSongs",
    {
      params: { did, limit, offset },
    },
  );
  return response.data.tracks;
};

export const getAlbum = async (did: string, rkey: string) => {
  const response = await client.get("/xrpc/app.rocksky.album.getAlbum", {
    params: { uri: `at://${did}/app.rocksky.album/${rkey}` },
  });
  return response.data;
};

export const getArtist = async (did: string, rkey: string) => {
  const response = await client.get("/xrpc/app.rocksky.artist.getArtist", {
    params: { uri: `at://${did}/app.rocksky.artist/${rkey}` },
  });
  return response.data;
};

export const getArtistListeners = async (uri: string, limit: number) => {
  const response = await client.get(
    "/xrpc/app.rocksky.artist.getArtistListeners",
    { params: { uri, limit } },
  );
  return response.data;
};

export const getAlbumsByGenre = async (
  genre: string,
  offset = 0,
  limit = 20,
) => {
  const response = await client.get<{ albums: Album[] }>(
    "/xrpc/app.rocksky.album.getAlbums",
    {
      params: {
        genre,
        limit,
        offset,
      },
    },
  );
  return response.data;
};

export const getArtistsByGenre = async (
  genre: string,
  offset = 0,
  limit = 20,
) => {
  const response = await client.get<{ artists: Artist[] }>(
    "/xrpc/app.rocksky.artist.getArtists",
    {
      params: {
        genre,
        limit,
        offset,
      },
    },
  );
  return response.data;
};

export const getTracksByGenre = async (
  genre: string,
  offset = 0,
  limit = 20,
) => {
  const response = await client.get<{ tracks: Track[] }>(
    "/xrpc/app.rocksky.song.getSongs",
    {
      params: {
        genre,
        limit,
        offset,
      },
    },
  );
  return response.data;
};
