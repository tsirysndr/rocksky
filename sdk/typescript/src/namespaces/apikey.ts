import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type ListApikeysParams = { limit?: number; offset?: number };
export type CreateApikeyInput = { name: string; description?: string };
export type UpdateApikeyInput = {
  id: string;
  name: string;
  description?: string;
};
export type RemoveApikeyParams = { id: string };

export class ApikeyNamespace {
  constructor(private readonly call: Call) {}

  getApikeys<T = unknown>(
    params: ListApikeysParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.apikey.getApikeys", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  createApikey<T = unknown>(input: CreateApikeyInput, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.apikey.createApikey", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  updateApikey<T = unknown>(input: UpdateApikeyInput, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.apikey.updateApikey", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  removeApikey<T = unknown>(params: RemoveApikeyParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.apikey.removeApikey", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
