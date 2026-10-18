import Redlock from "redlock";
export const create = (clients) => () => new Redlock(clients);
export const acquireImpl = (r) => (keys) => (ms) => () => r.acquire(keys, ms);
export const releaseImpl = (lock) => () => lock.release().then(() => undefined);
