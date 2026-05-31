import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type ScrobblesChartParams = {
  did?: string;
  artisturi?: string;
  albumuri?: string;
  songuri?: string;
  genre?: string;
  from?: string;
  to?: string;
};

export type TopChartParams = {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
};

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

  getTopArtists<T = unknown>(params: TopChartParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.charts.getTopArtists", "GET", {
      params,
      ...opts,
    });
  }

  getTopTracks<T = unknown>(params: TopChartParams = {}, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.charts.getTopTracks", "GET", {
      params,
      ...opts,
    });
  }
}
