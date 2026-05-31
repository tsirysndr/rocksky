import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type CreateScrobbleInput = {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  mbId?: string;
  isrc?: string;
  albumArt?: string;
  trackNumber?: number;
  releaseDate?: string;
  year?: number;
  discNumber?: number;
  lyrics?: string;
  composer?: string;
  copyrightMessage?: string;
  label?: string;
  artistPicture?: string;
  spotifyLink?: string;
  lastfmLink?: string;
  tidalLink?: string;
  appleMusicLink?: string;
  youtubeLink?: string;
  deezerLink?: string;
  timestamp?: number;
};

export type GetScrobblesParams = {
  did?: string;
  following?: boolean;
  limit?: number;
  offset?: number;
};

export class ScrobbleNamespace {
  constructor(private readonly call: Call) {}

  createScrobble<T = unknown>(
    input: CreateScrobbleInput,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.scrobble.createScrobble", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  getScrobble<T = unknown>(params: { uri: string }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.scrobble.getScrobble", "GET", {
      params,
      ...opts,
    });
  }

  getScrobbles<T = unknown>(
    params: GetScrobblesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.scrobble.getScrobbles", "GET", {
      params,
      ...opts,
    });
  }
}
