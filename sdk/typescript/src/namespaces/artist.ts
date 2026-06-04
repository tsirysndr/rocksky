import type {
  GetArtistAlbumsParams,
  GetArtistListenersParams,
  GetArtistParams,
  GetArtistRecentListenersParams,
  GetArtistsParams,
  GetArtistTracksParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type { GetArtistsParams, GetArtistTracksParams };
export type ArtistListenersParams = GetArtistListenersParams;

export class ArtistNamespace {
  constructor(private readonly call: Call) {}

  getArtist<T = unknown>(params: GetArtistParams, opts?: RequestOptions) {
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

  getArtistAlbums<T = unknown>(params: GetArtistAlbumsParams, opts?: RequestOptions) {
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
    params: GetArtistListenersParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.artist.getArtistListeners", "GET", {
      params,
      ...opts,
    });
  }

  getArtistRecentListeners<T = unknown>(
    params: GetArtistRecentListenersParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.artist.getArtistRecentListeners", "GET", {
      params,
      ...opts,
    });
  }
}
