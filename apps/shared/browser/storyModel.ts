import { storyLinks, type StoryLink } from "../storyLinks";

export const STORY_DURATION = 15_000;
export type StoryItem = {
  id: string;
  title: string;
  artist: string;
  albumArt?: string;
  artistUri?: string;
  albumUri?: string;
  uri?: string;
  avatar?: string;
  handle: string;
  did: string;
  createdAt: string;
  trackId?: string;
  trackUri?: string;
  liked?: boolean;
  likesCount?: number;
};
export type SongLinks = {
  spotifyLink?: string | null;
  mbId?: string | null;
  albumUri?: string | null;
};
export type AlbumLinks = {
  discogs?: {
    url?: string;
    releaseId?: number;
    masterId?: number;
    master?: { url?: string; masterId?: number };
  };
};
export function storyPath(uri?: string) {
  const match =
    /^at:\/\/([^/]+)\/app\.rocksky\.(song|scrobble|artist|album)\/([^/?#]+)$/.exec(
      uri || "",
    );
  return match ? `/${match[1]}/${match[2]}/${match[3]}` : undefined;
}
export function shoutUri(story: StoryItem) {
  return (
    story.trackUri ||
    (story.uri?.includes("/app.rocksky.scrobble/") ? story.uri : undefined)
  );
}
export async function loadStoryLinks(
  story: StoryItem,
  getSong: (uri: string) => Promise<SongLinks | null>,
  getAlbum: (did: string, rkey: string) => Promise<AlbumLinks>,
): Promise<StoryLink[]> {
  // Metadata failures must not hide other available service links or sharing.
  const song = story.trackUri
    ? await getSong(story.trackUri).catch(() => null)
    : null;
  const album = /^at:\/\/([^/]+)\/app\.rocksky\.album\/([^/]+)$/.exec(
    song?.albumUri || story.albumUri || "",
  );
  const release = album
    ? await getAlbum(album[1], album[2]).catch(() => null)
    : null;
  const d = release?.discogs;
  const discogsLink =
    d?.url ||
    (d?.releaseId
      ? `https://www.discogs.com/release/${d.releaseId}`
      : undefined) ||
    d?.master?.url ||
    (d?.master?.masterId || d?.masterId
      ? `https://www.discogs.com/master/${d?.master?.masterId || d?.masterId}`
      : undefined);
  return storyLinks({
    spotifyLink: song?.spotifyLink,
    mbId: song?.mbId,
    discogsLink,
    uri: story.uri || story.trackUri,
  });
}
