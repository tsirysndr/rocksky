import type { ScrobbleViewDetailed } from "@rocksky/sdk";
import { rocksky } from "../lib/rocksky";

/** app.rocksky.scrobble.getScrobble — the live AppView response carries a few
 * fields on top of the lexicon view. */
interface ScrobbleDetailResponse extends ScrobbleViewDetailed {
  albumArtist?: string;
  tags?: string[];
  lyrics?: string;
  spotifyLink?: string;
  composer?: string;
}

export const getScrobbleByUri = async (uri: string) => {
  if (uri.includes("app.rocksky.song")) {
    return null;
  }
  const data = (await rocksky().get("app.rocksky.scrobble.getScrobble", {
    uri,
  })) as ScrobbleDetailResponse;

  return {
    id: data.id,
    title: data.title ?? "",
    artist: data.artist ?? "",
    albumArtist: data.albumArtist ?? "",
    album: data.album,
    cover: data.cover ?? "",
    tags: data.tags ?? [],
    artistUri: data.artistUri,
    albumUri: data.albumUri,
    listeners: data.listeners || 1,
    scrobbles: data.scrobbles || 1,
    lyrics: data.lyrics,
    spotifyLink: data.spotifyLink,
    composer: data.composer,
    uri: data.uri,
    // `uri` is the scrobble's; liking needs the song's.
    trackUri: data.trackUri,
    liked: data.liked,
    artists: (data.artists ?? []).map((artist) => ({
      id: artist.id ?? "",
      name: artist.name ?? "",
      picture: artist.picture,
      uri: artist.uri,
    })),
    firstScrobble: data.firstScrobble && {
      handle: data.firstScrobble.handle ?? "",
      avatar: data.firstScrobble.avatar ?? "",
      timestamp: data.firstScrobble.timestamp ?? "",
    },
  };
};

/** app.rocksky.feed.getFeedGenerators — live response shape; the lexicon view
 * omits the generator `did` and the full creator profile. */
export interface FeedGeneratorsResponse {
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
}

export const getFeedGenerators = async (): Promise<FeedGeneratorsResponse> => {
  return (await rocksky().get(
    "app.rocksky.feed.getFeedGenerators",
  )) as FeedGeneratorsResponse;
};

/** The scrobble shape the live feed endpoints return — much richer than the
 * lexicon's ScrobbleViewBasic (user, cover, links, like state, ...). */
export type FeedScrobble = {
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

export const getFeed = async (uri: string, limit?: number, cursor?: string) => {
  const response = (await rocksky().get("app.rocksky.feed.getFeed", {
    feed: uri,
    limit,
    cursor,
  })) as {
    feed: { scrobble: FeedScrobble }[];
    cursor?: string;
  };

  return {
    songs: response.feed.map(({ scrobble }) => scrobble),
    cursor: response.cursor,
  };
};

export const getScrobbles = async (
  did: string,
  following: boolean = false,
  offset: number = 0,
  limit: number = 50,
) => {
  const response = (await rocksky().get("app.rocksky.scrobble.getScrobbles", {
    did,
    following,
    offset,
    limit,
  })) as {
    scrobbles: FeedScrobble[];
  };

  return {
    scrobbles: response.scrobbles,
  };
};
