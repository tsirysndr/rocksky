import type {
  CreateSongInput,
  GetSongParams,
  GetSongRecentListenersParams,
  GetSongsParams,
  MatchSongParams,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export type {
  CreateSongInput,
  GetSongParams,
  GetSongRecentListenersParams,
  GetSongsParams,
  MatchSongParams,
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
    params: GetSongRecentListenersParams,
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
