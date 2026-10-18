import redis from "redis";
import { Ok, Error as GError, toList } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

const wrap = (p, f = (v) => v) => p.then((v) => new Ok(f(v)), (e) => new GError(e));

export const connect = (url, onError) =>
  wrap(redis.createClient({ url }).on("error", (e) => onError(e)).connect());
export const get = (c, k) => wrap(c.get(k), (v) => (v == null ? new None() : new Some(v)));
export const set = (c, k, v) => wrap(c.set(k, v), () => undefined);
export const setEx = (c, k, s, v) => wrap(c.setEx(k, s, v), () => undefined);
export const setNxEx = (c, k, s, v) => wrap(c.set(k, v, { NX: true, EX: s }), (r) => r === "OK");
export const del = (c, keys) => wrap(c.del(keys.toArray()));
export const incr = (c, k) => wrap(c.incr(k));
export const ttl = (c, k) => wrap(c.ttl(k));
export const expire = (c, k, s) => wrap(c.expire(k, s), (r) => !!r);
export const keys = (c, p) => wrap(c.keys(p), toList);
export const exists = (c, k) => wrap(c.exists(k), (n) => n > 0);
export const publish = (c, ch, m) => wrap(c.publish(ch, m));
export const eval_ = (c, script, keys, args) =>
  wrap(c.eval(script, { keys: keys.toArray(), arguments: args.toArray() }));
export { eval_ as eval };
export const slidingWindowCount = (c, key, score, member, minScore, expire) =>
  wrap(
    c.multi()
      .zAdd(key, { score, value: member })
      .zRemRangeByScore(key, 0, minScore)
      .zCard(key)
      .expire(key, expire)
      .exec(),
    (results) => Number(results?.[2] ?? 0),
  );
export const hGetAll = (c, k) => wrap(c.hGetAll(k), (o) => toList(Object.entries(o)));
export const hSet = (c, k, f, v) => wrap(c.hSet(k, f, v));
export const lPush = (c, k, v) => wrap(c.lPush(k, v));
export const lRange = (c, k, a, b) => wrap(c.lRange(k, a, b), toList);
export const quit = (c) => c.quit().then(() => undefined);
