import type { PutMirrorSourceInput } from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export type { PutMirrorSourceInput };

export class MirrorNamespace {
  constructor(private readonly call: Call) {}

  getMirrorSources<T = unknown>(opts?: RequestOptions) {
    return this.call<T>("app.rocksky.mirror.getMirrorSources", "GET", {
      requireAuth: true,
      ...opts,
    });
  }

  putMirrorSource<T = unknown>(
    input: PutMirrorSourceInput,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.mirror.putMirrorSource", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    });
  }
}
