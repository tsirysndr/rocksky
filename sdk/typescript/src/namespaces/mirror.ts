import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export type PutMirrorSourceInput = {
  provider: string;
  enabled?: boolean;
  externalUsername?: string;
  apiKey?: string;
};

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
