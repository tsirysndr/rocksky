import type {
  DownloadFileParams,
  GetFilesParams,
  GetMetadataParams,
  GetTemporaryLinkParams,
} from "../generated/types";
import type { RequestOptions } from "../types";
import type { Call } from "./_helpers";

export class DropboxNamespace {
  constructor(private readonly call: Call) {}

  getFiles<T = unknown>(
    params: GetFilesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.dropbox.getFiles", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getMetadata<T = unknown>(params: GetMetadataParams, opts?: RequestOptions) {
    return this.call<T>("app.rocksky.dropbox.getMetadata", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getTemporaryLink<T = unknown>(
    params: GetTemporaryLinkParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.dropbox.getTemporaryLink", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  downloadFile<T = unknown>(
    params: DownloadFileParams,
    opts?: RequestOptions,
  ) {
    return this.call<T>("app.rocksky.dropbox.downloadFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
