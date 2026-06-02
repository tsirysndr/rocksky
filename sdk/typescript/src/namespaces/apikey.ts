import type {
  CreateApikeyInput,
  GetApikeysParams,
  RemoveApikeyParams,
  UpdateApikeyInput,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export type { CreateApikeyInput, UpdateApikeyInput };
export type ListApikeysParams = GetApikeysParams;

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
