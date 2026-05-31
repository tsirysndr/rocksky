import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type GetProfileParams = { did?: string };
export type DidParam = { did: string };
export type ActorPagedParams = DidParam & {
  limit?: number;
  offset?: number;
};
export type ActorRangeParams = ActorPagedParams & {
  startDate?: string;
  endDate?: string;
};

export class ActorNamespace {
  constructor(private readonly call: Call) {}

  getProfile<T = unknown>(params: GetProfileParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getProfile", "GET", {
      params,
      ...opts,
    });
  }

  getActorAlbums<T = unknown>(params: ActorRangeParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorAlbums", "GET", {
      params,
      ...opts,
    });
  }

  getActorArtists<T = unknown>(params: ActorRangeParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorArtists", "GET", {
      params,
      ...opts,
    });
  }

  getActorSongs<T = unknown>(params: ActorRangeParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorSongs", "GET", {
      params,
      ...opts,
    });
  }

  getActorScrobbles<T = unknown>(
    params: ActorPagedParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.actor.getActorScrobbles", "GET", {
      params,
      ...opts,
    });
  }

  getActorLovedSongs<T = unknown>(
    params: ActorPagedParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.actor.getActorLovedSongs", "GET", {
      params,
      ...opts,
    });
  }

  getActorPlaylists<T = unknown>(
    params: ActorPagedParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.actor.getActorPlaylists", "GET", {
      params,
      ...opts,
    });
  }

  getActorNeighbours<T = unknown>(params: DidParam, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorNeighbours", "GET", {
      params,
      ...opts,
    });
  }

  getActorCompatibility<T = unknown>(params: DidParam, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorCompatibility", "GET", {
      params,
      ...opts,
    });
  }
}
