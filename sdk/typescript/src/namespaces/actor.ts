import type {
  GetActorAlbumsParams,
  GetActorArtistsParams,
  GetActorCompatibilityParams,
  GetActorLovedSongsParams,
  GetActorNeighboursParams,
  GetActorPlaylistsParams,
  GetActorScrobblesParams,
  GetActorSongsParams,
  GetProfileParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type { GetProfileParams };
export type ActorPagedParams = GetActorScrobblesParams;
export type ActorRangeParams = GetActorAlbumsParams;

export class ActorNamespace {
  constructor(private readonly call: Call) {}

  getProfile<T = unknown>(params: GetProfileParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getProfile", "GET", {
      params,
      ...opts,
    });
  }

  getActorAlbums<T = unknown>(params: GetActorAlbumsParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorAlbums", "GET", {
      params,
      ...opts,
    });
  }

  getActorArtists<T = unknown>(params: GetActorArtistsParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorArtists", "GET", {
      params,
      ...opts,
    });
  }

  getActorSongs<T = unknown>(params: GetActorSongsParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorSongs", "GET", {
      params,
      ...opts,
    });
  }

  getActorScrobbles<T = unknown>(
    params: GetActorScrobblesParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.actor.getActorScrobbles", "GET", {
      params,
      ...opts,
    });
  }

  getActorLovedSongs<T = unknown>(
    params: GetActorLovedSongsParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.actor.getActorLovedSongs", "GET", {
      params,
      ...opts,
    });
  }

  getActorPlaylists<T = unknown>(
    params: GetActorPlaylistsParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.actor.getActorPlaylists", "GET", {
      params,
      ...opts,
    });
  }

  getActorNeighbours<T = unknown>(params: GetActorNeighboursParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorNeighbours", "GET", {
      params,
      ...opts,
    });
  }

  getActorCompatibility<T = unknown>(params: GetActorCompatibilityParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.actor.getActorCompatibility", "GET", {
      params,
      ...opts,
    });
  }
}
