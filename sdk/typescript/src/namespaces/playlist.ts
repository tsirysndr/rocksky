import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export class PlaylistNamespace {
  constructor(private readonly call: Call) {}

  getPlaylists<T = unknown>(
    params: { limit?: number; offset?: number } = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.getPlaylists", "GET", {
      params,
      ...opts,
    });
  }

  getPlaylist<T = unknown>(params: { uri: string }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.playlist.getPlaylist", "GET", {
      params,
      ...opts,
    });
  }

  createPlaylist<T = unknown>(
    params: { name: string; description?: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.createPlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  removePlaylist<T = unknown>(params: { uri: string }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.playlist.removePlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  startPlaylist<T = unknown>(
    params: { uri: string; shuffle?: boolean; position?: number },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.startPlaylist", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  insertDirectory<T = unknown>(
    params: { uri: string; directory: string; position?: number },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.insertDirectory", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  insertFiles<T = unknown>(
    params: { uri: string; files: string[]; position?: number },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.insertFiles", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  removeTrack<T = unknown>(
    params: { uri: string; position: number },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.playlist.removeTrack", "POST", {
      params,
      ...opts,
    });
  }
}
