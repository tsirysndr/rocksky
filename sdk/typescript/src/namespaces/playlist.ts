import type {
  CreatePlaylistParams,
  GetPlaylistParams,
  GetPlaylistsParams,
  InsertDirectoryParams,
  InsertFilesParams,
  RemovePlaylistParams,
  RemoveTrackParams,
  StartPlaylistParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export class PlaylistNamespace {
  constructor(private readonly call: Call) {}

  getPlaylists(
    params: GetPlaylistsParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.playlist.getPlaylists", "GET", {
      params,
      ...opts,
    });
  }

  getPlaylist(params: GetPlaylistParams, opts?: RequestOptions) {
    return this.call("app.rocksky.playlist.getPlaylist", "GET", {
      params,
      ...opts,
    });
  }

  createPlaylist(
    params: CreatePlaylistParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.playlist.createPlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  removePlaylist(params: RemovePlaylistParams, opts?: RequestOptions) {
    return this.call("app.rocksky.playlist.removePlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  startPlaylist(
    params: StartPlaylistParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.playlist.startPlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  insertDirectory(
    params: InsertDirectoryParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.playlist.insertDirectory", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  insertFiles(
    params: InsertFilesParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.playlist.insertFiles", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  removeTrack(
    params: RemoveTrackParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.playlist.removeTrack", "POST", {
      params,
      ...opts,
    });
  }
}
