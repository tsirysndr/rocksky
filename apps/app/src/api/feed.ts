import { storage } from "../storage";
import type { FeedGenerator, FeedScrobble, Story } from "../types/feed";
import { client } from ".";

const authHeaders = () => ({
  Authorization: storage.getToken()
    ? `Bearer ${storage.getToken()}`
    : undefined,
});

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
    artists: response.data?.artists,
    firstScrobble: response.data?.firstScrobble,
  };
};

export const getFeedGenerators = async () => {
  const response = await client.get<{ feeds: FeedGenerator[] }>(
    "/xrpc/app.rocksky.feed.getFeedGenerators",
  );
  if (response.status !== 200) {
    return null;
  }
  return response.data;
};

export const getFeed = async (uri: string, limit?: number, cursor?: string) => {
  const response = await client.get<{
    feed?: { scrobble: FeedScrobble }[];
    cursor?: string;
  }>("/xrpc/app.rocksky.feed.getFeed", {
    params: {
      feed: uri,
      limit,
      cursor,
    },
    headers: authHeaders(),
  });

  if (response.status !== 200) {
    return { songs: [], cursor: undefined };
  }

  // An unknown feed uri answers `{scrobbles: []}` instead of `{feed, cursor}`.
  const feed = Array.isArray(response.data?.feed) ? response.data.feed : [];
  return {
    songs: feed.map(({ scrobble }) => scrobble),
    cursor: response.data?.cursor,
  };
};

export const getScrobbles = async (
  did: string,
  following = false,
  offset = 0,
  limit = 50,
) => {
  const response = await client.get<{ scrobbles?: FeedScrobble[] }>(
    "/xrpc/app.rocksky.scrobble.getScrobbles",
    {
      params: {
        did,
        following,
        offset,
        limit,
      },
      headers: authHeaders(),
    },
  );

  if (response.status !== 200) {
    return { scrobbles: [] };
  }

  return {
    scrobbles: response.data?.scrobbles ?? [],
  };
};

export const getStories = async (params: {
  size: number;
  feed?: string;
  following?: boolean;
}) => {
  const response = await client.get<{ stories?: Story[] }>(
    "/xrpc/app.rocksky.feed.getStories",
    {
      params,
      headers: authHeaders(),
    },
  );

  if (response.status !== 200) {
    return [];
  }

  return response.data?.stories ?? [];
};
