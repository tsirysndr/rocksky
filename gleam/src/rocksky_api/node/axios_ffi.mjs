import axios from "axios";
import { Ok, Error as GError, toList } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

const unwrap = (o) => (o instanceof Some ? o[0] : undefined);
const fromEntries = (list) => {
  const o = {};
  for (const [k, v] of list) o[k] = v;
  return o;
};

export const create = (baseURL, timeout) => axios.create({ baseURL, timeout: unwrap(timeout) });
export const global = () => axios;

const toResponse = (r) => ({
  status: r.status,
  headers: toList(Object.entries(r.headers ?? {}).map(([k, v]) => [k, String(v)])),
  data: r.data,
});

export const request = (instance, method, url, body, o) =>
  instance
    .request({
      method,
      url,
      data: body,
      headers: fromEntries(o.headers),
      params: fromEntries(o.params),
      timeout: unwrap(o.timeout_ms),
      responseType: unwrap(o.response_type),
      validateStatus: o.validate_status ? () => true : undefined,
    })
    .then((r) => new Ok(toResponse(r)), (e) => new GError(e));

export const isAxiosError = (e) => axios.isAxiosError(e);
export const errorStatus = (e) =>
  typeof e?.response?.status === "number" ? new Some(e.response.status) : new None();
export const errorData = (e) => e?.response?.data;
export const lowercase = (s) => s.toLowerCase();
export const postWithSignal = (instance,url,body,signal) =>
  instance.post(url,body,{signal:unwrap(signal)}).then(r=>new Ok(toResponse(r)),e=>new GError(e));
