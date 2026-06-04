import type {
  DownloadFileParams,
  GetFileParams,
  GetFilesParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export class GoogleDriveNamespace {
  constructor(private readonly call: Call) {}

  getFile(params: GetFileParams, opts?: RequestOptions) {
    return this.call("app.rocksky.googledrive.getFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getFiles(
    params: GetFilesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.googledrive.getFiles", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  downloadFile(
    params: DownloadFileParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.googledrive.downloadFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
