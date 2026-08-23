/* eslint-disable @typescript-eslint/no-explicit-any */
// The `any` returns preserve the previous untyped axios `response.data`
// contract for existing consumers.
import { rocksky } from "../lib/rocksky";

export const getScrobbleByUri = async (uri: string): Promise<any> => {
  if (uri.includes("app.rocksky.song")) return null;
  try {
    return await rocksky().scrobble(uri);
  } catch {
    return null;
  }
};

export const getFeedGenerators = async (): Promise<any> => {
  try {
    return await rocksky().feedGenerators();
  } catch {
    return null;
  }
};

export const getFeed = async (uri: string, limit?: number, cursor?: string) => {
  try {
    const data = (await rocksky().get("app.rocksky.feed.getFeed", {
      feed: uri,
      limit,
      cursor,
    })) as {
      feed: { scrobble: Record<string, unknown> }[];
      cursor?: string;
    };
    return {
      songs: data.feed.map(({ scrobble }) => scrobble),
      cursor: data.cursor,
    };
  } catch {
    return { songs: [], cursor: undefined };
  }
};

export const getScrobbles = async (
  did: string,
  following = false,
  offset = 0,
  limit = 30,
): Promise<{ scrobbles: any[] }> => {
  try {
    const scrobbles = await rocksky().scrobbleFeed(
      did,
      following,
      limit,
      offset,
    );
    return { scrobbles };
  } catch {
    return { scrobbles: [] };
  }
};
