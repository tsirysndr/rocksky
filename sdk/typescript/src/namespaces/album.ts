import type {
  GetAlbumParams,
  GetAlbumsParams,
  GetAlbumTracksParams,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export type { GetAlbumsParams };

export class AlbumNamespace {
  constructor(private readonly call: Call) {}

  getAlbum<T = unknown>(params: GetAlbumParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.album.getAlbum", "GET", {
      params,
      ...opts,
    });
  }

  getAlbums<T = unknown>(params: GetAlbumsParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.album.getAlbums", "GET", {
      params,
      ...opts,
    });
  }

  getAlbumTracks<T = unknown>(params: GetAlbumTracksParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.album.getAlbumTracks", "GET", {
      params,
      ...opts,
    });
  }
}
