import axios from "axios";

export const create = (cfg) => () => {
  const c = { baseURL: cfg.baseURL };
  if (cfg.timeout !== null) c.timeout = cfg.timeout;
  return axios.create(c);
};
export const global = axios;

const options = (o) => {
  const r = { headers: o.headers };
  if (o.params !== null) r.params = o.params;
  if (o.timeout !== null) r.timeout = o.timeout;
  if (o.responseType !== null) r.responseType = o.responseType;
  if (o.maxRedirects !== null) r.maxRedirects = o.maxRedirects;
  if (!o.validateStatus) r.validateStatus = () => true;
  return r;
};

export const requestImpl = (inst) => (method) => (url) => (body) => (o) => () => {
  const cfg = { ...options(o), method, url };
  if (body !== null) cfg.data = body;
  return inst.request(cfg);
};
export const toNullableImpl = (x) => x;
export const postFormImpl = (inst) => (url) => (fields) => (o) => () => inst.postForm(url, fields, options(o));

export const data_ = (r) => r.data;
export const status = (r) => r.status;
export const headers = (r) => Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k, String(v)]));

export const isAxiosError = (e) => axios.isAxiosError(e);
export const errorStatusImpl = (e) => e?.response?.status ?? null;
export const errorDataImpl = (e) => (e?.response?.data === undefined ? null : e.response.data);
export const errorMessage = (e) => String(e?.message ?? e);

export const postWithSignalImpl = inst => url => body => signal => () => {
  signal?.throwIfAborted();
  return inst.post(url, body, { signal: signal ?? undefined });
};
