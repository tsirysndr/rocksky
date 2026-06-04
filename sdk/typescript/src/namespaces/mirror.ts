import type { PutMirrorSourceInput } from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type { PutMirrorSourceInput };

export class MirrorNamespace {
  constructor(private readonly call: Call) {}

  getMirrorSources(opts?: RequestOptions) {
    return this.call("app.rocksky.mirror.getMirrorSources", "GET", {
      requireAuth: true,
      ...opts,
    });
  }

  putMirrorSource(
    input: PutMirrorSourceInput,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.mirror.putMirrorSource", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }
}
