import type {
  GetStatsParams,
  GetWrappedParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export class StatsNamespace {
  constructor(private readonly call: Call) {}

  getStats<T = unknown>(params: GetStatsParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.stats.getStats", "GET", {
      params,
      ...opts,
    });
  }

  getWrapped<T = unknown>(
    params: GetWrappedParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.stats.getWrapped", "GET", {
      params,
      ...opts,
    });
  }
}
