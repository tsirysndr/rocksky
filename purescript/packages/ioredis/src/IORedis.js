import Redis from "ioredis";
export const create = (url) => () => new Redis(url);
export const quitImpl = (r) => () => r.quit().then(() => undefined);
