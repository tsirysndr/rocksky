import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type UriParam = { uri: string };
export type GetAlbumsParams = {
  limit?: number;
  offset?: number;
  genre?: string;
};

export class AlbumNamespace {
  constructor(private readonly call: Call) {}

  getAlbum<T = unknown>(params: UriParam, opts?: RequestOptions) {
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

  getAlbumTracks<T = unknown>(params: UriParam, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.album.getAlbumTracks", "GET", {
      params,
      ...opts,
    });
  }
}
