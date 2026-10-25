export const info = request => {
  const url = new URL(request.url);
  return { url: url.toString(), pathname: url.pathname, search: url.search, method: request.method };
};
export const requestHeader = request => name => request.headers.get(name) ?? '';
export const envValue = env => name => env[name] ?? '';
export const query = request => name => new URL(request.url).searchParams.get(name);
export const matches = pattern => value => new RegExp(pattern).test(value);
export const replaceAll = from => to => value => value.split(from).join(to);
export const decode = value => decodeURIComponent(value);
export const changeHost = request => host => {
  const url = new URL(request.url);
  url.host = host;
  url.hostname = host;
  return url.toString();
};
export const changePath = request => path => {
  const url = new URL(request.url);
  url.pathname = path;
  return url.toString();
};
export const ogUrl = request => {
  const url = new URL('https://api.rocksky.app/public/og');
  url.searchParams.set('path', new URL(request.url).pathname);
  return url.toString();
};
const headersOf = entries => new Headers(entries.map(({name, value}) => [name, value]));
export const status = response => response.status;
export const responseHeader = response => name => response.headers.get(name) ?? '';
export const response = status => body => headers => head => () =>
  new Response(head ? null : body, {status, headers: headersOf(headers)});
export const jsonResponse = value => headers => () => Response.json(value, {headers: headersOf(headers)});
export const modifyResponse = response => additions => removals => head => () => {
  const headers = new Headers(response.headers);
  for (const {name, value} of additions) headers.set(name, value);
  for (const name of removals) headers.delete(name);
  return new Response(head ? null : response.body, {status: response.status, statusText: response.statusText, headers});
};
export const fetchImpl = url => request => bypass => () => bypass
  ? fetch(new Request(url, request), {cf: {cacheTtl: 0, cacheEverything: false}})
  : fetch(new URL(url), request);
export const fetchStaticImpl = url => method => headers => bypass => () => fetch(url, {
  method, headers: headersOf(headers), redirect: 'manual',
  ...(bypass ? {cf: {cacheTtl: 0, cacheEverything: false}} : {}),
});
export const readOgImpl = response => () => response.json();
export const rewrite = response => tags => () => new HTMLRewriter()
  .on('meta[property^="og:"]', {element: el => el.remove()})
  .on('meta[name^="twitter:"]', {element: el => el.remove()})
  .on('head', {element: head => head.append(tags, {html: true})})
  .transform(response);

export const fetchGetImpl = url => () => fetch(url);
