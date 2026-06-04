import type {
  GetAlbumParams,
  GetAlbumsParams,
  GetAlbumTracksParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type { GetAlbumsParams };

export class AlbumNamespace {
  constructor(private readonly call: Call) {}

  getAlbum(params: GetAlbumParams, opts?: RequestOptions) {
    return this.call("app.rocksky.album.getAlbum", "GET", {
      params,
      ...opts,
    });
  }

  getAlbums(params: GetAlbumsParams = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.album.getAlbums", "GET", {
      params,
      ...opts,
    });
  }

  getAlbumTracks(params: GetAlbumTracksParams, opts?: RequestOptions) {
    return this.call("app.rocksky.album.getAlbumTracks", "GET", {
      params,
      ...opts,
    });
  }
}
