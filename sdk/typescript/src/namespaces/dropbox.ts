import type {
  DownloadFileParams,
  GetFilesParams,
  GetMetadataParams,
  GetTemporaryLinkParams,
} from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export class DropboxNamespace {
  constructor(private readonly call: Call) {}

  getFiles(
    params: GetFilesParams = {},
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.dropbox.getFiles", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getMetadata(params: GetMetadataParams, opts?: RequestOptions) {
    return this.call("app.rocksky.dropbox.getMetadata", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  getTemporaryLink(
    params: GetTemporaryLinkParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.dropbox.getTemporaryLink", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }

  downloadFile(
    params: DownloadFileParams,
    opts?: RequestOptions,
  ) {
    return this.call("app.rocksky.dropbox.downloadFile", "GET", {
      params,
      requireAuth: true,
      ...opts,
    });
  }
}
