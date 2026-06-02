import type {
  GetStatsParams,
  GetWrappedParams,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

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
