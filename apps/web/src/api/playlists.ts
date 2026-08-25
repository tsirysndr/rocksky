import { rocksky } from "../lib/rocksky";

export type PlaylistSummary = {
  id: string;
  name: string;
  picture: string;
  description?: string;
  uri?: string;
  spotifyLink?: string;
  tidalLink?: string;
  appleMusicLink?: string;
  trackCount: number;
  trackArts?: string[];
};

// Escape for a double-quoted RSQL value; `*` stays, the caller adds wildcards.
const rsqlQuote = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const playlistNameFilter = (term: string): string | undefined => {
  const trimmed = term.trim();
  if (!trimmed) return undefined;
  const value = `"*${rsqlQuote(trimmed)}*"`;
  return `name==${value},description==${value}`;
};

export const getPlaylists = async (
  did: string,
  filter?: string,
): Promise<PlaylistSummary[]> => {
  const response = (await rocksky().get("app.rocksky.actor.getActorPlaylists", {
    did,
    ...(filter ? { filter } : {}),
  })) as { playlists: PlaylistSummary[] };
  return response.playlists;
};

export type CreatedPlaylist = { uri: string; cid: string };

// Publishes the record to the user's PDS; the AppView row appears once
// jetstream ingests the commit, so listings lag by a moment.
export const createPlaylist = async (input: {
  name: string;
  description?: string;
  pictureUrl?: string;
}): Promise<CreatedPlaylist> =>
  rocksky().post<CreatedPlaylist>("app.rocksky.playlist.createPlaylist", {
    params: {
      name: input.name,
      description: input.description,
      pictureUrl: input.pictureUrl,
    },
  });

// Owner only; the server rejects anyone else.
export const addSongsToPlaylist = async (input: {
  uri: string;
  songs: string[];
}): Promise<{ uris: string[] }> =>
  rocksky().post<{ uris: string[] }>("app.rocksky.playlist.addSongs", {
    params: { uri: input.uri, songs: input.songs },
  });

export const updatePlaylist = async (input: {
  uri: string;
  name?: string;
  description?: string;
  pictureUrl?: string;
}): Promise<CreatedPlaylist> =>
  rocksky().post<CreatedPlaylist>("app.rocksky.playlist.updatePlaylist", {
    params: {
      uri: input.uri,
      name: input.name,
      description: input.description,
      pictureUrl: input.pictureUrl,
    },
  });

export const removePlaylist = async (uri: string): Promise<void> => {
  await rocksky().post("app.rocksky.playlist.removePlaylist", {
    params: { uri },
  });
};

/**
 * `index` identifies one entry; `songUri` alone would drop every copy of a
 * song that sits in the playlist more than once. It is still sent so the
 * server can reject a stale position.
 */
export const removeTrackFromPlaylist = async (input: {
  uri: string;
  songUri: string;
  index: number;
}): Promise<void> => {
  await rocksky().post("app.rocksky.playlist.removeTrack", {
    params: { uri: input.uri, songUri: input.songUri, index: input.index },
  });
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
    liked?: boolean;
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
