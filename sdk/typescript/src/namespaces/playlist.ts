import type {
  CreatePlaylistParams,
  GetPlaylistParams,
  GetPlaylistsParams,
  InsertDirectoryParams,
  InsertFilesParams,
  RemovePlaylistParams,
  RemoveTrackParams,
  StartPlaylistParams,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export class PlaylistNamespace {
  constructor(private readonly call: Call) {}

  getPlaylists<T = unknown>(
    params: GetPlaylistsParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.getPlaylists", "GET", {
      params,
      ...opts,
    });
  }

  getPlaylist<T = unknown>(params: GetPlaylistParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.playlist.getPlaylist", "GET", {
      params,
      ...opts,
    });
  }

  createPlaylist<T = unknown>(
    params: CreatePlaylistParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.createPlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  removePlaylist<T = unknown>(params: RemovePlaylistParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.playlist.removePlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  startPlaylist<T = unknown>(
    params: StartPlaylistParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.startPlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  insertDirectory<T = unknown>(
    params: InsertDirectoryParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.insertDirectory", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  insertFiles<T = unknown>(
    params: InsertFilesParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.insertFiles", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  removeTrack<T = unknown>(
    params: RemoveTrackParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.removeTrack", "POST", {
      params,
      ...opts,
    });
  }
}
