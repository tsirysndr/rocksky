import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export class DropboxNamespace {
  constructor(private readonly call: Call) {}

  getFiles<T = unknown>(
    params: { at?: string } = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.dropbox.getFiles", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getMetadata<T = unknown>(params: { path: string }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.dropbox.getMetadata", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getTemporaryLink<T = unknown>(
    params: { path: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.dropbox.getTemporaryLink", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  downloadFile<T = unknown>(
    params: { fileId: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.dropbox.downloadFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
