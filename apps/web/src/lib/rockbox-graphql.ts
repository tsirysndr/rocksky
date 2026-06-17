import { ROCKBOX_URL } from "../consts";

async function gql<T>(did: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const url = `${ROCKBOX_URL}/${did}/graphql`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as { data: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface RockboxTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  artistId: string | null;
  albumId: string | null;
  elapsed: number;
  length: number;
}

export interface RockboxQueueTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  path: string;
  length: number;
}

export interface RockboxPlaylist {
  index: number;
  amount: number;
  tracks: RockboxQueueTrack[];
}

const CURRENT_TRACK_QUERY = `
  query GetCurrentTrack {
    currentTrack {
      id title artist album albumArt artistId albumId elapsed length
    }
  }
`;

const PLAYBACK_STATUS_QUERY = `
  query GetPlaybackStatus {
    status
  }
`;

const CURRENT_PLAYLIST_QUERY = `
  query GetCurrentPlaylist {
    playlistGetCurrent {
      index amount
      tracks { id title artist album albumArt path length }
    }
  }
`;

export async function getCurrentTrack(did: string): Promise<RockboxTrack | null> {
  const data = await gql<{ currentTrack: RockboxTrack | null }>(did, CURRENT_TRACK_QUERY);
  return data.currentTrack;
}

export async function getPlaybackStatus(did: string): Promise<number> {
  const data = await gql<{ status: number }>(did, PLAYBACK_STATUS_QUERY);
  return data.status;
}

export async function getCurrentPlaylist(did: string): Promise<RockboxPlaylist | null> {
  const data = await gql<{ playlistGetCurrent: RockboxPlaylist | null }>(did, CURRENT_PLAYLIST_QUERY);
  return data.playlistGetCurrent;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function resumePlayback(did: string): Promise<void> {
  await gql(did, `mutation { resume }`);
}

export async function pausePlayback(did: string): Promise<void> {
  await gql(did, `mutation { pause }`);
}

export async function nextTrack(did: string): Promise<void> {
  await gql(did, `mutation { next }`);
}

export async function previousTrack(did: string): Promise<void> {
  await gql(did, `mutation { previous }`);
}

export async function seekTo(did: string, elapsed: number): Promise<void> {
  await gql(did, `mutation Seek($e: Int!) { play(elapsed: $e, offset: 0) }`, { e: elapsed });
}

// Insert tracks at position (0=after current, -1=last).
// After inserting, call startPlaylist to begin from an index.
export async function insertTracks(did: string, tracks: string[], position: number): Promise<void> {
  await gql(did, `
    mutation InsertTracks($position: Int!, $tracks: [String!]!) {
      insertTracks(position: $position, tracks: $tracks)
    }
  `, { position, tracks });
}

export async function startPlaylist(did: string, startIndex: number): Promise<void> {
  await gql(did, `
    mutation StartPlaylist($startIndex: Int) {
      playlistStart(startIndex: $startIndex, elapsed: 0, offset: 0)
    }
  `, { startIndex });
}

export async function playTrack(did: string, path: string): Promise<void> {
  await gql(did, `
    mutation PlayTrack($path: String!) {
      playTrack(path: $path)
    }
  `, { path });
}
