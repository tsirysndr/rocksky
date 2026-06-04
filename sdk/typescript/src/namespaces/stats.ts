import type {
  GetStatsParams,
  GetWrappedParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export class StatsNamespace {
  constructor(private readonly call: Call) {}

  getStats(params: GetStatsParams, opts?: RequestOptions) {
    return this.call("app.rocksky.stats.getStats", "GET", {
      params,
      ...opts,
    });
  }

  getWrapped(
    params: GetWrappedParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.stats.getWrapped", "GET", {
      params,
      ...opts,
    });
  }
}
