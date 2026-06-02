import type {
  DownloadFileParams,
  GetFileParams,
  GetFilesParams,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export class GoogleDriveNamespace {
  constructor(private readonly call: Call) {}

  getFile<T = unknown>(params: GetFileParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.googledrive.getFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getFiles<T = unknown>(
    params: GetFilesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.googledrive.getFiles", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  downloadFile<T = unknown>(
    params: DownloadFileParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.googledrive.downloadFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
