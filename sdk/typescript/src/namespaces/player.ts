import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

type PlayerId = { playerId?: string };

export class PlayerNamespace {
  constructor(private readonly call: Call) {}

  getCurrentlyPlaying<T = unknown>(
    params: PlayerId & { actor?: string } = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.getCurrentlyPlaying", "GET", {
      params,
      ...opts,
    });
  }

  getPlaybackQueue<T = unknown>(
    params: PlayerId = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.getPlaybackQueue", "GET", {
      params,
      ...opts,
    });
  }

  play<T = unknown>(params: PlayerId = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.player.play", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  pause<T = unknown>(params: PlayerId = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.player.pause", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  next<T = unknown>(params: PlayerId = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.player.next", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  previous<T = unknown>(params: PlayerId = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.player.previous", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  seek<T = unknown>(
    params: PlayerId & { position: number },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.seek", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  playFile<T = unknown>(
    params: PlayerId & { fileId: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.playFile", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  playDirectory<T = unknown>(
    params: PlayerId & {
      directoryId: string;
      shuffle?: boolean;
      recurse?: boolean;
      position?: number;
    },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.playDirectory", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  addItemsToQueue<T = unknown>(
    params: PlayerId & {
      items: string[];
      position?: number;
      shuffle?: boolean;
    },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.addItemsToQueue", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  addDirectoryToQueue<T = unknown>(
    params: PlayerId & {
      directory: string;
      position?: number;
      shuffle?: boolean;
    },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.addDirectoryToQueue", "POST", {
      params,
      ...opts,
    });
  }
}
