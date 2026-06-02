import type {
  AddDirectoryToQueueParams,
  AddItemsToQueueParams,
  GetCurrentlyPlayingParams,
  GetPlaybackQueueParams,
  NextParams,
  PauseParams,
  PlayDirectoryParams,
  PlayFileParams,
  PlayParams,
  PreviousParams,
  SeekParams,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export class PlayerNamespace {
  constructor(private readonly call: Call) {}

  getCurrentlyPlaying<T = unknown>(
    params: GetCurrentlyPlayingParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.getCurrentlyPlaying", "GET", {
      params,
      ...opts,
    });
  }

  getPlaybackQueue<T = unknown>(
    params: GetPlaybackQueueParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.getPlaybackQueue", "GET", {
      params,
      ...opts,
    });
  }

  play<T = unknown>(params: PlayParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.player.play", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  pause<T = unknown>(params: PauseParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.player.pause", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  next<T = unknown>(params: NextParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.player.next", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  previous<T = unknown>(params: PreviousParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.player.previous", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  seek<T = unknown>(
    params: SeekParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.seek", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  playFile<T = unknown>(
    params: PlayFileParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.playFile", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  playDirectory<T = unknown>(
    params: PlayDirectoryParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.playDirectory", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  addItemsToQueue<T = unknown>(
    params: AddItemsToQueueParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.addItemsToQueue", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  addDirectoryToQueue<T = unknown>(
    params: AddDirectoryToQueueParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.player.addDirectoryToQueue", "POST", {
      params,
      ...opts,
    });
  }
}
