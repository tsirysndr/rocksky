import { client } from ".";

export const getScrobbleByUri = async (uri: string) => {
  if (uri.includes("app.rocksky.song")) {
    return null;
  }
  const response = await client.get("/xrpc/app.rocksky.scrobble.getScrobble", {
    params: { uri },
  });

  if (response.status !== 200) {
    return null;
  }

  return {
    id: response.data?.id,
    title: response.data?.title,
    artist: response.data?.artist,
    albumArtist: response.data?.albumArtist,
    album: response.data?.album,
    cover: response.data?.cover,
    tags: response.data?.tags,
    artistUri: response.data?.artistUri,
    albumUri: response.data?.albumUri,
    listeners: response.data?.listeners || 1,
    scrobbles: response.data?.scrobbles || 1,
    lyrics: response.data?.lyrics,
    spotifyLink: response.data?.spotifyLink,
    composer: response.data?.composer,
    uri: response.data?.uri,
  };
};

export const getFeedGenerators = async () => {
  const response = await client.get<{
    feeds: {
      id: string;
      name: string;
      uri: string;
      description: string;
      did: string;
      avatar?: string;
      creator: {
        avatar?: string;
        displayName: string;
        handle: string;
        did: string;
        id: string;
      };
    }[];
  }>("/xrpc/app.rocksky.feed.getFeedGenerators");
  if (response.status !== 200) {
    return null;
  }
  return response.data;
};

export const getFeed = async (uri: string, limit?: number, cursor?: string) => {
  const response = await client.get<{
    feed: {
      scrobble: {
        title: string;
        artist: string;
        albumArtist: string;
        album: string;
        trackNumber: number;
        duration: number;
        mbId: string | null;
        youtubeLink: string | null;
        spotifyLink: string | null;
        appleMusicLink: string | null;
        tidalLink: string | null;
        sha256: string;
        discNumber: number;
        composer: string | null;
        genre: string | null;
        label: string | null;
        copyrightMessage: string | null;
        uri: string;
        albumUri: string;
        artistUri: string;
        trackUri: string;
        xataVersion: number;
        cover: string;
        date: string;
        user: string;
        userDisplayName: string;
        userAvatar: string;
        tags: string[];
        likesCount: number;
        liked: boolean;
        id: string;
      };
    }[];
    cursor?: string;
  }>("/xrpc/app.rocksky.feed.getFeed", {
    params: {
      feed: uri,
      limit,
      cursor,
    },
    headers: {
      Authorization: localStorage.getItem("token")
        ? `Bearer ${localStorage.getItem("token")}`
        : undefined,
    },
  });

  if (response.status !== 200) {
    return { songs: [], cursor: undefined };
  }

  return {
    songs: response.data.feed.map(({ scrobble }) => scrobble),
    cursor: response.data.cursor,
  };
};

export const getScrobbles = async (
  did: string,
  following: boolean = false,
  offset: number = 0,
  limit: number = 50,
) => {
  const response = await client.get<{
    scrobbles: {
      title: string;
      artist: string;
      albumArtist: string;
      album: string;
      trackNumber: number;
      duration: number;
      mbId: string | null;
      youtubeLink: string | null;
      spotifyLink: string | null;
      appleMusicLink: string | null;
      tidalLink: string | null;
      sha256: string;
      discNumber: number;
      composer: string | null;
      genre: string | null;
      label: string | null;
      copyrightMessage: string | null;
      uri: string;
      albumUri: string;
      artistUri: string;
      trackUri: string;
      xataVersion: number;
      cover: string;
      date: string;
      user: string;
      userDisplayName: string;
      userAvatar: string;
      tags: string[];
      likesCount: number;
      liked: boolean;
      id: string;
    }[];
  }>("/xrpc/app.rocksky.scrobble.getScrobbles", {
    params: {
      did,
      following,
      offset,
      limit,
    },
    headers: {
      Authorization: localStorage.getItem("token")
        ? `Bearer ${localStorage.getItem("token")}`
        : undefined,
    },
  });

  if (response.status !== 200) {
    return { scrobbles: [] };
  }

  return {
    scrobbles: response.data.scrobbles,
  };
};
