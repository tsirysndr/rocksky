import type {
  AlbumViewBasic,
  AlbumViewDetailed,
  ArtistGetArtistsOutput,
  ArtistViewBasic,
  ArtistViewDetailed,
  GetActorAlbumsOutput,
  GetActorArtistsOutput,
  GetAlbumsOutput,
  GetArtistAlbumsOutput,
  GetArtistRecentListenersOutput,
  GetArtistTracksOutput,
  GetSongRecentListenersOutput,
  GetTopArtistsOutput,
  GetTopTracksOutput,
  SongRecentListenerView,
  SongViewBasic,
  SongViewDetailed,
} from "@rocksky/sdk";
import { rocksky } from "../lib/rocksky";

/** app.rocksky.song.getSong — the live AppView response carries a few fields
 * on top of the lexicon view. */
interface SongDetailResponse extends SongViewDetailed {
  lyrics?: string;
  spotifyLink?: string;
  composer?: string;
}

export const getSongByUri = async (uri: string) => {
  if (uri.includes("app.rocksky.scrobble")) {
    return null;
  }

  const data = (await rocksky().get("app.rocksky.song.getSong", {
    uri,
  })) as SongDetailResponse;
  return {
    id: data.id,
    title: data.title ?? "",
    artist: data.artist ?? "",
    albumArtist: data.albumArtist ?? "",
    album: data.album,
    cover: data.albumArt ?? "",
    tags: data.tags ?? [],
    artistUri: data.artistUri,
    albumUri: data.albumUri,
    listeners: data.uniqueListeners || 1,
    scrobbles: data.playCount || 1,
    lyrics: data.lyrics,
    spotifyLink: data.spotifyLink,
    composer: data.composer,
    uri: data.uri,
    // A song's own URI is what liking needs, so they're the same here.
    trackUri: data.uri,
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

export const getArtistTracks = async (
  uri: string,
  limit = 10,
): Promise<SongViewBasic[]> => {
  const response = (await rocksky().get("app.rocksky.artist.getArtistTracks", {
    uri,
    limit,
  })) as GetArtistTracksOutput;
  return response.tracks ?? [];
};

export const getArtistAlbums = async (
  uri: string,
  limit = 10,
): Promise<AlbumViewBasic[]> => {
  const response = (await rocksky().get("app.rocksky.artist.getArtistAlbums", {
    uri,
    limit,
  })) as GetArtistAlbumsOutput;
  return response.albums ?? [];
};

export const getArtists = async (
  did: string,
  offset = 0,
  limit = 30,
  startDate?: Date,
  endDate?: Date,
): Promise<GetActorArtistsOutput> => {
  return (await rocksky().get("app.rocksky.actor.getActorArtists", {
    did,
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  })) as GetActorArtistsOutput;
};

export const getAlbums = async (
  did: string,
  offset = 0,
  limit = 12,
  startDate?: Date,
  endDate?: Date,
): Promise<GetActorAlbumsOutput> => {
  return (await rocksky().get("app.rocksky.actor.getActorAlbums", {
    did,
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  })) as GetActorAlbumsOutput;
};

/** app.rocksky.actor.getActorSongs — the live AppView returns `tracks`
 * (the lexicon output says `songs`). */
interface GetActorSongsResponse {
  tracks?: SongViewBasic[];
}

export const getTracks = async (
  did: string,
  offset = 0,
  limit = 20,
  startDate?: Date,
  endDate?: Date,
): Promise<GetActorSongsResponse> => {
  return (await rocksky().get("app.rocksky.actor.getActorSongs", {
    did,
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  })) as GetActorSongsResponse;
};

export const getLovedTracks = async (
  did: string,
  offset = 0,
  limit = 20,
): Promise<SongViewBasic[]> => {
  return rocksky().lovedSongs(did, limit, offset);
};

/** app.rocksky.album.getAlbum — the live tracklist entries also carry label
 * information beyond the lexicon song view. */
export interface AlbumTrackView extends SongViewBasic {
  copyrightMessage?: string;
  label?: string;
}

export interface AlbumDetailResponse extends Omit<AlbumViewDetailed, "tracks"> {
  tracks?: AlbumTrackView[];
}

export const getAlbum = async (
  did: string,
  rkey: string,
): Promise<AlbumDetailResponse> => {
  return (await rocksky().get("app.rocksky.album.getAlbum", {
    uri: `at://${did}/app.rocksky.album/${rkey}`,
  })) as AlbumDetailResponse;
};

/** app.rocksky.artist.getArtist — the live AppView response carries biography
 * and link fields on top of the lexicon view. */
export interface ArtistDetailResponse extends ArtistViewDetailed {
  born?: string;
  bornIn?: string;
  died?: string;
  genres?: string[];
  spotifyLink?: string;
}

export const getArtist = async (
  did: string,
  rkey: string,
): Promise<ArtistDetailResponse> => {
  return (await rocksky().get("app.rocksky.artist.getArtist", {
    uri: `at://${did}/app.rocksky.artist/${rkey}`,
  })) as ArtistDetailResponse;
};

/** The live artist-listener shape — refines the lexicon view: the AppView
 * always fills the profile, mostListenedSong and ranking fields. */
export interface ArtistListenerView {
  id: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  mostListenedSong: {
    title: string;
    uri: string;
    playCount: number;
  };
  totalPlays: number;
  rank: number;
}

export const getArtistListeners = async (
  uri: string,
  limit: number,
): Promise<{ listeners: ArtistListenerView[] }> => {
  return (await rocksky().artistListeners(uri, limit)) as {
    listeners: ArtistListenerView[];
  };
};

export type RecentListener = SongRecentListenerView;

export const getArtistRecentListeners = async (
  uri: string,
  limit = 10,
): Promise<GetArtistRecentListenersOutput> => {
  return rocksky().artistRecentListeners(uri, limit);
};

export const getSongRecentListeners = async (
  uri: string,
  limit = 10,
): Promise<GetSongRecentListenersOutput> => {
  return rocksky().songRecentListeners(uri, limit);
};

export const getAlbumsByGenre = async (
  genre: string,
  offset = 0,
  limit = 20,
): Promise<GetAlbumsOutput> => {
  return (await rocksky().get("app.rocksky.album.getAlbums", {
    genre,
    limit,
    offset,
  })) as GetAlbumsOutput;
};

export const getArtistsByGenre = async (
  genre: string,
  offset = 0,
  limit = 20,
): Promise<ArtistGetArtistsOutput> => {
  return (await rocksky().get("app.rocksky.artist.getArtists", {
    genre,
    limit,
    offset,
  })) as ArtistGetArtistsOutput;
};

/** app.rocksky.song.getSongs — the live AppView returns `tracks`
 * (the lexicon output says `songs`). */
interface GetSongsResponse {
  tracks?: SongViewBasic[];
}

export const getTracksByGenre = async (
  genre: string,
  offset = 0,
  limit = 20,
): Promise<GetSongsResponse> => {
  return (await rocksky().get("app.rocksky.song.getSongs", {
    genre,
    limit,
    offset,
  })) as GetSongsResponse;
};

export const getTopArtists = async (
  offset = 0,
  limit = 20,
  startDate?: Date,
  endDate?: Date,
): Promise<GetTopArtistsOutput> => {
  return (await rocksky().get("app.rocksky.charts.getTopArtists", {
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  })) as GetTopArtistsOutput;
};

export const getTopTracks = async (
  offset = 0,
  limit = 20,
  startDate?: Date,
  endDate?: Date,
): Promise<GetTopTracksOutput> => {
  return (await rocksky().get("app.rocksky.charts.getTopTracks", {
    limit,
    offset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  })) as GetTopTracksOutput;
};

export type { AlbumViewBasic, ArtistViewBasic, SongViewBasic };
