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

// Position constants for insertTracks — match rockbox firmware (apps/playlist.h).
// Anyone passing a literal positive integer ends up inserting at that LITERAL
// index in the playlist rather than relative-to-current, which is almost
// never what you want. Always use one of these named values.
export const PLAYLIST_PREPEND               = -1; // insert at top of playlist
export const PLAYLIST_INSERT                = -2; // at last_insert_pos
export const PLAYLIST_INSERT_LAST           = -3; // append at end ("play last")
export const PLAYLIST_INSERT_FIRST          = -4; // insert after current ("play next")
export const PLAYLIST_INSERT_SHUFFLED       = -5;
export const PLAYLIST_REPLACE               = -6;
export const PLAYLIST_INSERT_LAST_SHUFFLED  = -7;
export const PLAYLIST_INSERT_LAST_ROTATED   = -8;

// Insert tracks at a rockbox position constant (see PLAYLIST_* above).
// After inserting, call startPlaylist to begin from an index.
export async function insertTracks(did: string, tracks: string[], position: number): Promise<void> {
  await gql(did, `
    mutation InsertTracks($position: Int!, $tracks: [String!]!) {
      insertTracks(position: $position, tracks: $tracks)
    }
  `, { position, tracks });
}

// Remove a single track from the current playlist by absolute index.
export async function playlistRemoveTrack(did: string, index: number): Promise<void> {
  await gql(did, `
    mutation RemoveTrack($index: Int!) {
      playlistRemoveTrack(index: $index)
    }
  `, { index });
}

// Wipe the current playlist.
export async function playlistRemoveAllTracks(did: string): Promise<void> {
  await gql(did, `mutation { playlistRemoveAllTracks }`);
}

// Shuffle the current playlist in place.
export async function shufflePlaylist(did: string): Promise<void> {
  await gql(did, `mutation { shufflePlaylist }`);
}

// Hard-stop playback (clears the audio buffer, useful before switching tracks).
export async function hardStop(did: string): Promise<void> {
  await gql(did, `mutation { hardStop }`);
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

// ── Audio settings ────────────────────────────────────────────────────────────
//
// Numeric units in this section follow rockbox's wire format:
//   * Gain / cut: tenths of dB (e.g. -30 = -3.0 dB)
//   * Q factor:   tenths       (e.g. 70  = Q 7.0)
//   * Balance:    -100..+100   (% of full L/R skew)
//   * Crossfade duration: seconds
//
// All conversions to human units happen in the UI layer.

export interface EqBand {
  cutoff: number; // Hz
  gain: number;   // tenths of dB
  q: number;      // ×10
}

export interface ReplayGainSettings {
  noclip: boolean;
  type: number;   // 0 off, 1 track, 2 album, 3 trackIfShuffling
  preamp: number; // tenths of dB
}

export interface GlobalSettings {
  volume: number;
  playlistShuffle: boolean;
  repeatMode: number; // 0 off, 1 all, 2 one, 3 shuffle, 4 a-b
  bass: number;
  bassCutoff: number;
  treble: number;
  trebleCutoff: number;
  crossfade: number;            // 0 off, 1 on, 2 shuffle, 3 album change, 4 track change
  fadeOnStop: boolean;
  crossfadeFadeInDelay: number;
  crossfadeFadeInDuration: number;
  crossfadeFadeOutDelay: number;
  crossfadeFadeOutDuration: number;
  crossfadeFadeOutMixmode: number;
  balance: number;
  stereoWidth: number;
  stereoswMode: number;
  channelConfig: number;        // 0 stereo, 1 mono, 2 custom, 3 mono-left, 4 mono-right, 5 karaoke
  ditheringEnabled: boolean;
  partyMode: boolean;
  playerName: string;
  eqEnabled: boolean;
  eqBandSettings: EqBand[];
  replaygainSettings: ReplayGainSettings;
}

export type SettingsPatch = Partial<{
  volume: number;
  playlistShuffle: boolean;
  repeatMode: number;
  bass: number;
  bassCutoff: number;
  treble: number;
  trebleCutoff: number;
  crossfade: number;
  fadeOnStop: boolean;
  fadeInDelay: number;
  fadeInDuration: number;
  fadeOutDelay: number;
  fadeOutDuration: number;
  fadeOutMixmode: number;
  balance: number;
  stereoWidth: number;
  stereoswMode: number;
  channelConfig: number;
  ditheringEnabled: boolean;
  partyMode: boolean;
  playerName: string;
  eqEnabled: boolean;
  eqBandSettings: EqBand[];
  eqPrecut: number;
  replaygainSettings: ReplayGainSettings;
}>;

const GET_GLOBAL_SETTINGS = `
  query GetGlobalSettings {
    globalSettings {
      volume playlistShuffle repeatMode
      bass bassCutoff treble trebleCutoff
      crossfade fadeOnStop
      crossfadeFadeInDelay crossfadeFadeInDuration
      crossfadeFadeOutDelay crossfadeFadeOutDuration crossfadeFadeOutMixmode
      balance stereoWidth stereoswMode
      channelConfig ditheringEnabled partyMode playerName
      eqEnabled
      eqBandSettings { q cutoff gain }
      replaygainSettings { noclip type preamp }
    }
  }
`;

export async function getGlobalSettings(did: string): Promise<GlobalSettings> {
  const data = await gql<{ globalSettings: GlobalSettings }>(did, GET_GLOBAL_SETTINGS);
  return data.globalSettings;
}

export async function saveSettings(did: string, patch: SettingsPatch): Promise<void> {
  // saveSettings takes a NewGlobalSettings input; only provided fields are applied.
  await gql(did, `
    mutation SaveSettings($settings: NewGlobalSettings!) {
      saveSettings(settings: $settings)
    }
  `, { settings: patch });
}
