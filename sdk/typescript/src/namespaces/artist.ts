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

  getArtist(params: GetArtistParams, opts?: RequestOptions) {
    return this.call("app.rocksky.artist.getArtist", "GET", {
      params,
      ...opts,
    });
  }

  getArtists(params: GetArtistsParams = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.artist.getArtists", "GET", {
      params,
      ...opts,
    });
  }

  getArtistAlbums(params: GetArtistAlbumsParams, opts?: RequestOptions) {
    return this.call("app.rocksky.artist.getArtistAlbums", "GET", {
      params,
      ...opts,
    });
  }

  getArtistTracks(
    params: GetArtistTracksParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.artist.getArtistTracks", "GET", {
      params,
      ...opts,
    });
  }

  getArtistListeners(
    params: GetArtistListenersParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.artist.getArtistListeners", "GET", {
      params,
      ...opts,
    });
  }

  getArtistRecentListeners(
    params: GetArtistRecentListenersParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.artist.getArtistRecentListeners", "GET", {
      params,
      ...opts,
    });
  }
}
