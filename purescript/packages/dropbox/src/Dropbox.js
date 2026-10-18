import { Dropbox, DropboxAuth } from "dropbox";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const orNull = (v) => (v === undefined ? null : v);

export const newDropbox = (opts) => () => new Dropbox(dropNulls(opts));
export const newAuth = (opts) => () => new DropboxAuth(dropNulls(opts));
export const fromAuth = (auth) => () => new Dropbox({ auth });

const entry = (e) => ({
  tag: e[".tag"] ?? "",
  name: e.name ?? "",
  id: orNull(e.id),
  pathLower: orNull(e.path_lower),
  pathDisplay: orNull(e.path_display),
  size: orNull(e.size),
  clientModified: orNull(e.client_modified),
  serverModified: orNull(e.server_modified),
  contentHash: orNull(e.content_hash),
  rev: orNull(e.rev),
});

const listResult = (r) => ({
  entries: (r.entries ?? []).map(entry),
  cursor: r.cursor,
  hasMore: Boolean(r.has_more),
});

export const filesListFolderImpl = (d) => (i) => () =>
  d
    .filesListFolder(
      dropNulls({ path: i.path, recursive: i.recursive, limit: i.limit, include_deleted: i.includeDeleted }),
    )
    .then((r) => listResult(r.result));

export const filesListFolderContinueImpl = (d) => (cursor) => () =>
  d.filesListFolderContinue({ cursor }).then((r) => listResult(r.result));

export const filesGetMetadataImpl = (d) => (path) => () => d.filesGetMetadata({ path }).then((r) => entry(r.result));

export const filesGetTemporaryLinkImpl = (d) => (path) => () =>
  d.filesGetTemporaryLink({ path }).then((r) => ({ link: r.result.link, metadata: entry(r.result.metadata) }));

export const filesDownloadImpl = (d) => (path) => () =>
  d.filesDownload({ path }).then((r) => {
    const bin = r.result.fileBinary;
    return {
      metadata: entry(r.result),
      fileBinary: Buffer.isBuffer(bin) ? bin : Buffer.from(bin),
    };
  });

export const getAuthenticationUrlImpl = (a) => (i) => () =>
  a.getAuthenticationUrl(
    i.redirectUri,
    i.state ?? undefined,
    i.authType ?? "code",
    i.tokenAccessType ?? undefined,
    i.scope ?? undefined,
  );

export const getAccessTokenFromCodeImpl = (a) => (redirectUri) => (code) => () =>
  a.getAccessTokenFromCode(redirectUri, code).then((r) => {
    const t = r.result;
    return {
      accessToken: t.access_token,
      refreshToken: orNull(t.refresh_token),
      expiresIn: orNull(t.expires_in),
      tokenType: orNull(t.token_type),
      scope: orNull(t.scope),
      uid: orNull(t.uid),
      accountId: orNull(t.account_id),
    };
  });

export const refreshAccessTokenImpl = (a) => () => a.refreshAccessToken().then(() => undefined);
export const getAccessToken = (a) => () => a.getAccessToken() ?? "";
export const setAccessToken = (a) => (t) => () => {
  a.setAccessToken(t);
};
export const getRefreshToken = (a) => () => a.getRefreshToken() ?? "";
export const setRefreshToken = (a) => (t) => () => {
  a.setRefreshToken(t);
};
