import { client } from ".";

export const getFeed = () => {
  return [];
};

export const getFeedByUri = async (uri: string) => {
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
    tags: [],
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
