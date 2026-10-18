import { google } from "googleapis";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const orNull = (v) => (v === undefined ? null : v);

export const newOAuth2 = (cfg) => () => new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);

export const generateAuthUrl = (c) => (o) => () =>
  c.generateAuthUrl(dropNulls({ access_type: o.accessType, prompt: o.prompt, scope: o.scope, state: o.state }));

const credentials = (t) => ({
  accessToken: orNull(t?.access_token),
  refreshToken: orNull(t?.refresh_token),
  expiryDate: orNull(t?.expiry_date),
  scope: orNull(t?.scope),
  tokenType: orNull(t?.token_type),
  idToken: orNull(t?.id_token),
});

export const getTokenImpl = (c) => (code) => () => c.getToken(code).then((r) => credentials(r.tokens));

export const setCredentials = (c) => (cr) => () => {
  c.setCredentials(
    dropNulls({
      access_token: cr.accessToken,
      refresh_token: cr.refreshToken,
      expiry_date: cr.expiryDate,
      scope: cr.scope,
      token_type: cr.tokenType,
      id_token: cr.idToken,
    }),
  );
};

export const getCredentials = (c) => () => credentials(c.credentials);

export const refreshAccessTokenImpl = (c) => () => c.refreshAccessToken().then((r) => credentials(r.credentials));

export const drive = (auth) => () => google.drive({ version: "v3", auth });

const file = (f) => ({
  id: f.id ?? "",
  name: f.name ?? "",
  mimeType: orNull(f.mimeType),
  size: orNull(f.size),
  parents: Array.isArray(f.parents) ? f.parents : [],
  modifiedTime: orNull(f.modifiedTime),
  md5Checksum: orNull(f.md5Checksum),
  webContentLink: orNull(f.webContentLink),
  thumbnailLink: orNull(f.thumbnailLink),
  trashed: orNull(f.trashed),
});

export const filesListImpl = (d) => (i) => () =>
  d.files
    .list(
      dropNulls({
        q: i.q,
        fields: i.fields,
        pageSize: i.pageSize,
        pageToken: i.pageToken,
        orderBy: i.orderBy,
        spaces: i.spaces,
      }),
    )
    .then((r) => ({
      files: (r.data.files ?? []).map(file),
      nextPageToken: orNull(r.data.nextPageToken),
    }));

export const filesGetImpl = (d) => (i) => () =>
  d.files.get(dropNulls({ fileId: i.fileId, fields: i.fields })).then((r) => file(r.data));

export const filesGetMediaImpl = (d) => (fileId) => () =>
  d.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" }).then((r) => Buffer.from(r.data));

export const filesGetMediaStreamImpl = (d) => (fileId) => () =>
  d.files.get({ fileId, alt: "media" }, { responseType: "stream" }).then((r) => r.data);

export const filesCreateImpl = (d) => (i) => () =>
  d.files
    .create(
      dropNulls({
        requestBody: dropNulls({ name: i.name, mimeType: i.mimeType, parents: i.parents.length ? i.parents : null }),
        fields: i.fields,
      }),
    )
    .then((r) => file(r.data));

export const aboutGetImpl = (d) => (fields) => () => d.about.get({ fields }).then((r) => r.data);
