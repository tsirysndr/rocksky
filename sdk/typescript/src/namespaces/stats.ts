import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export class StatsNamespace {
  constructor(private readonly call: Call) {}

  getStats<T = unknown>(params: { did: string }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.stats.getStats", "GET", {
      params,
      ...opts,
    });
  }

  getWrapped<T = unknown>(
    params: { did: string; year?: number },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.stats.getWrapped", "GET", {
      params,
      ...opts,
    });
  }
}
