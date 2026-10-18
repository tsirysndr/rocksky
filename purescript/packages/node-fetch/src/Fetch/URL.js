export const parseImpl = input => {
  try {
    const url = new URL(input);
    return { hostname: url.hostname, pathname: url.pathname };
  } catch { return null; }
};
export const create = input => () => new URL(input);
export const protocol = url => url.protocol;
export const pathname = url => url.pathname;
export const search = url => url.search;
export const setParam = url => key => value => () => { url.searchParams.set(key, value); };
export const serialize = url => () => url.toString();

export const resolve = path => base => () => new URL(path, base);
