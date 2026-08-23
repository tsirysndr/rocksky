import { rocksky } from "../lib/rocksky";

type PlaylistSummary = {
  id: string;
  name: string;
  picture: string;
  description?: string;
  uri?: string;
  spotifyLink?: string;
  tidalLink?: string;
  appleMusicLink?: string;
  trackCount: number;
};

export const getPlaylists = async (
  did: string,
): Promise<PlaylistSummary[]> => {
  const response = (await rocksky().get(
    "app.rocksky.actor.getActorPlaylists",
    { did },
  )) as { playlists: PlaylistSummary[] };
  return response.playlists;
};

type PlaylistDetail = {
  id: string;
  name: string;
  picture: string;
  description?: string;
  uri?: string;
  spotifyLink?: string;
  tidalLink?: string;
  appleMusicLink?: string;
  curatedBy: {
    id: string;
    displayName: string;
    did: string;
    avatar: string;
    handle: string;
  };
  trackCount: number;
  tracks: {
    id: string;
    trackNumber: number;
    album: string;
    albumArt: string;
    albumArtist: string;
    title: string;
    artist: string;
    createdAt: string;
    uri: string;
    albumUri: string;
    artistUri: string;
    duration: number;
    discNumber: number;
  }[];
};

// app.rocksky.playlist.getPlaylist — the live AppView response uses
// name/picture/curatedBy (the lexicon view says title/coverImageUrl/curator*),
// so the local PlaylistDetail type describes the wire shape.
export const getPlaylist = async (
  did: string,
  rkey: string,
): Promise<PlaylistDetail> => {
  return (await rocksky().get("app.rocksky.playlist.getPlaylist", {
    uri: `at://${did}/app.rocksky.playlist/${rkey}`,
  })) as PlaylistDetail;
};
