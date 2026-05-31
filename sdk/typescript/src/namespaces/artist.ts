import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type UriParam = { uri: string };
export type ArtistListenersParams = UriParam & {
  limit?: number;
  offset?: number;
};
export type GetArtistsParams = {
  limit?: number;
  offset?: number;
  names?: string;
  genre?: string;
};
export type GetArtistTracksParams = {
  uri?: string;
  limit?: number;
  offset?: number;
};

export class ArtistNamespace {
  constructor(private readonly call: Call) {}

  getArtist<T = unknown>(params: UriParam, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.artist.getArtist", "GET", {
      params,
      ...opts,
    });
  }

  getArtists<T = unknown>(params: GetArtistsParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.artist.getArtists", "GET", {
      params,
      ...opts,
    });
  }

  getArtistAlbums<T = unknown>(params: UriParam, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.artist.getArtistAlbums", "GET", {
      params,
      ...opts,
    });
  }

  getArtistTracks<T = unknown>(
    params: GetArtistTracksParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.artist.getArtistTracks", "GET", {
      params,
      ...opts,
    });
  }

  getArtistListeners<T = unknown>(
    params: ArtistListenersParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.artist.getArtistListeners", "GET", {
      params,
      ...opts,
    });
  }

  getArtistRecentListeners<T = unknown>(
    params: ArtistListenersParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.artist.getArtistRecentListeners", "GET", {
      params,
      ...opts,
    });
  }
}
