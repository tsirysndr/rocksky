import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type GetSongParams = {
  uri?: string;
  mbid?: string;
  isrc?: string;
  spotifyId?: string;
};

export type GetSongsParams = GetSongParams & {
  limit?: number;
  offset?: number;
  genre?: string;
};

export type MatchSongParams = {
  title: string;
  artist: string;
  mbId?: string;
  isrc?: string;
};

export type CreateSongInput = {
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  duration?: number;
  mbId?: string;
  isrc?: string;
  albumArt?: string;
  trackNumber?: number;
  releaseDate?: string;
  year?: number;
  discNumber?: number;
  lyrics?: string;
};

export class SongNamespace {
  constructor(private readonly call: Call) {}

  getSong<T = unknown>(params: GetSongParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.song.getSong", "GET", {
      params,
      ...opts,
    });
  }

  getSongs<T = unknown>(params: GetSongsParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.song.getSongs", "GET", {
      params,
      ...opts,
    });
  }

  getSongRecentListeners<T = unknown>(
    params: { uri: string; limit?: number; offset?: number },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.song.getSongRecentListeners", "GET", {
      params,
      ...opts,
    });
  }

  matchSong<T = unknown>(params: MatchSongParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.song.matchSong", "GET", {
      params,
      ...opts,
    });
  }

  createSong<T = unknown>(input: CreateSongInput, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.song.createSong", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }
}
