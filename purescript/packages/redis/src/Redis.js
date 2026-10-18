import redis from "redis";

export const createClient = (url) => () => redis.createClient({ url });
export const connectImpl = (c) => () => c.connect();
export const onErrorImpl = (c, f) => {
  c.on("error", (e) => f(e));
};
export const quitImpl = (c) => () => c.quit().then(() => undefined);
export const duplicate = (c) => () => c.duplicate();

export const getImpl = (c) => (k) => () => c.get(k);
export const setImpl = (c) => (k) => (v) => () => c.set(k, v).then(() => undefined);
export const setExImpl = (c) => (k) => (s) => (v) => () => c.setEx(k, s, v).then(() => undefined);
export const setNXImpl = (c) => (k) => (v) => (s) => () => c.set(k, v, { NX: true, EX: s }).then((r) => r === "OK");
export const delImpl = (c) => (ks) => () => (ks.length === 0 ? Promise.resolve(0) : c.del(ks));
export const incrImpl = (c) => (k) => () => c.incr(k);
export const ttlImpl = (c) => (k) => () => c.ttl(k);
export const expireImpl = (c) => (k) => (s) => () => c.expire(k, s);
export const existsImpl = (c) => (k) => () => c.exists(k);
export const keysImpl = (c) => (p) => () => c.keys(p);
export const publishImpl = (c) => (ch) => (m) => () => c.publish(ch, m);
export const subscribeImpl = (c) => (ch) => (f) => () => c.subscribe(ch, (message, channel) => f(message, channel));
export const mkFn2Impl = (f) => (a, b) => f(a)(b)();
export const evalImpl = (c) => (script) => (keys) => (args) => () => c.eval(script, { keys, arguments: args });

export const multi = (c) => () => c.multi();
export const zAdd = (m) => (k) => (score) => (value) => () => m.zAdd(k, { score, value });
export const zRemRangeByScore = (m) => (k) => (lo) => (hi) => () => m.zRemRangeByScore(k, lo, hi);
export const zCard = (m) => (k) => () => m.zCard(k);
export const multiExpire = (m) => (k) => (s) => () => m.expire(k, s);
export const execImpl = (m) => () => m.exec();
