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

  getProfile(params: GetProfileParams = {}, opts?: RequestOptions) {
    return this.call("app.rocksky.actor.getProfile", "GET", {
      params,
      ...opts,
    });
  }

  getActorAlbums(params: GetActorAlbumsParams, opts?: RequestOptions) {
    return this.call("app.rocksky.actor.getActorAlbums", "GET", {
      params,
      ...opts,
    });
  }

  getActorArtists(params: GetActorArtistsParams, opts?: RequestOptions) {
    return this.call("app.rocksky.actor.getActorArtists", "GET", {
      params,
      ...opts,
    });
  }

  getActorSongs(params: GetActorSongsParams, opts?: RequestOptions) {
    return this.call("app.rocksky.actor.getActorSongs", "GET", {
      params,
      ...opts,
    });
  }

  getActorScrobbles(
    params: GetActorScrobblesParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.actor.getActorScrobbles", "GET", {
      params,
      ...opts,
    });
  }

  getActorLovedSongs(
    params: GetActorLovedSongsParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.actor.getActorLovedSongs", "GET", {
      params,
      ...opts,
    });
  }

  getActorPlaylists(
    params: GetActorPlaylistsParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.actor.getActorPlaylists", "GET", {
      params,
      ...opts,
    });
  }

  getActorNeighbours(params: GetActorNeighboursParams, opts?: RequestOptions) {
    return this.call("app.rocksky.actor.getActorNeighbours", "GET", {
      params,
      ...opts,
    });
  }

  getActorCompatibility(params: GetActorCompatibilityParams, opts?: RequestOptions) {
    return this.call("app.rocksky.actor.getActorCompatibility", "GET", {
      params,
      ...opts,
    });
  }
}
