// Web-platform operations only; routing and response policy are in Gleam.
export const url = request => new URL(request.url);
export const pathname = url => url.pathname;
export const method = request => request.method;
export const header = (request, name) => request.headers.get(name) ?? "";
export const env = (environment, name) => environment?.[name] ?? "";
export const query_has = (url, name) => url.searchParams.has(name);
export const query = (url, name) => url.searchParams.get(name) ?? "";
export const matches = (value, pattern) => new RegExp(pattern, "i").test(value);
export const response = (body, status, headers, empty) => new Response(empty ? null : body, {status, headers: Array.from(headers)});
export const copy = (response, additions, removals, empty) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of additions) headers.set(name, value);
  for (const name of removals) headers.delete(name);
  return new Response(empty ? null : response.body, { status: response.status, statusText: response.statusText, headers });
};
export const status = response => response.status;
export const response_header = (response, name) => response.headers.get(name) ?? "";
export const forward = (request, host, noCache) => {
  const target = new URL(request.url);
  target.host = host;
  target.hostname = host;
  return noCache
    ? fetch(new Request(target, request), {cf: {cacheTtl: 0, cacheEverything: false}})
    : fetch(target, request);
};
export const static_fetch = (url, method, headers, noCache) => fetch(url, {
  method, headers: Array.from(headers), redirect: "manual",
  ...(noCache ? {cf: {cacheTtl: 0, cacheEverything: false}} : {}),
});
export const asset_url = (url, path) => {
  const target = new URL("https://rocksky-landing.pages.dev");
  target.pathname = path;
  target.search = url.search;
  return target.toString();
};
export const redirect = (url, path) => {
  const target = new URL(url);
  target.pathname = path;
  return Response.redirect(target.toString(), 301);
};
export const og_url = url => {
  const target = new URL("https://api.rocksky.app/public/og");
  target.searchParams.set("path", url.pathname);
  return target.toString();
};
export const url_string = url => url.toString();
export const text = response => response.text();
export const decode_component = value => decodeURIComponent(value);
