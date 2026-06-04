import type {
  CreateSongInput,
  GetSongParams,
  GetSongRecentListenersParams,
  GetSongsParams,
  MatchSongParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type {
  CreateSongInput,
  GetSongParams,
  GetSongRecentListenersParams,
  GetSongsParams,
  MatchSongParams,
};

export class SongNamespace {
  constructor(private readonly call: Call) {}

  getSong(params: GetSongParams, opts?: RequestOptions) {
    return this.call("app.rocksky.song.getSong", "GET", {
      params,
      ...opts,
    });
  }

  getSongs(params: GetSongsParams = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.song.getSongs", "GET", {
      params,
      ...opts,
    });
  }

  getSongRecentListeners(
    params: GetSongRecentListenersParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.song.getSongRecentListeners", "GET", {
      params,
      ...opts,
    });
  }

  matchSong(params: MatchSongParams, opts?: RequestOptions) {
    return this.call("app.rocksky.song.matchSong", "GET", {
      params,
      ...opts,
    });
  }

  createSong(input: CreateSongInput, opts?: RequestOptions) {
    return this.call("app.rocksky.song.createSong", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }
}
