import type { Call } from "./_helpers";
import type { RequestOptions } from "../types";

export class GoogleDriveNamespace {
  constructor(private readonly call: Call) {}

  getFile<T = unknown>(params: { fileId: string }, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.googledrive.getFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getFiles<T = unknown>(
    params: { at?: string } = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.googledrive.getFiles", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  downloadFile<T = unknown>(
    params: { fileId: string },
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.googledrive.downloadFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
