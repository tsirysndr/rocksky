import type {
  GetScrobblesChartParams,
  GetTopArtistsParams,
  GetTopTracksParams,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export type ScrobblesChartParams = GetScrobblesChartParams;
export type TopChartParams = GetTopArtistsParams;

export class ChartsNamespace {
  constructor(private readonly call: Call) {}

  getScrobblesChart<T = unknown>(
    params: ScrobblesChartParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.charts.getScrobblesChart", "GET", {
      params,
      ...opts,
    });
  }

  getTopArtists<T = unknown>(params: GetTopArtistsParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.charts.getTopArtists", "GET", {
      params,
      ...opts,
    });
  }

  getTopTracks<T = unknown>(params: GetTopTracksParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.charts.getTopTracks", "GET", {
      params,
      ...opts,
    });
  }
}
