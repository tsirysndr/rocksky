import type {
  CreateApikeyInput,
  GetApikeysParams,
  RemoveApikeyParams,
  UpdateApikeyInput,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type { CreateApikeyInput, UpdateApikeyInput };
export type ListApikeysParams = GetApikeysParams;

export class ApikeyNamespace {
  constructor(private readonly call: Call) {}

  getApikeys(
    params: ListApikeysParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.apikey.getApikeys", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  createApikey(input: CreateApikeyInput, opts?: RequestOptions) {
    return this.call("app.rocksky.apikey.createApikey", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  updateApikey(input: UpdateApikeyInput, opts?: RequestOptions) {
    return this.call("app.rocksky.apikey.updateApikey", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }

  removeApikey(params: RemoveApikeyParams, opts?: RequestOptions) {
    return this.call("app.rocksky.apikey.removeApikey", "POST", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
