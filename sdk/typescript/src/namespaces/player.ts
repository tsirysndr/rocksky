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
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export class PlayerNamespace {
  constructor(private readonly call: Call) {}

  getCurrentlyPlaying(
    params: GetCurrentlyPlayingParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.player.getCurrentlyPlaying", "GET", {
      params,
      ...opts,
    });
  }

  getPlaybackQueue(
    params: GetPlaybackQueueParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.player.getPlaybackQueue", "GET", {
      params,
      ...opts,
    });
  }

  play(params: PlayParams = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.player.play", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  pause(params: PauseParams = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.player.pause", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  next(params: NextParams = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.player.next", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  previous(params: PreviousParams = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.player.previous", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  seek(
    params: SeekParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.player.seek", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  playFile(
    params: PlayFileParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.player.playFile", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  playDirectory(
    params: PlayDirectoryParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.player.playDirectory", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  addItemsToQueue(
    params: AddItemsToQueueParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.player.addItemsToQueue", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  addDirectoryToQueue(
    params: AddDirectoryToQueueParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.player.addDirectoryToQueue", "POST", {
      params,
      ...opts,
    });
  }
}
