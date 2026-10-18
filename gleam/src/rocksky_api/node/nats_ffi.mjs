import { connect as natsConnect, StringCodec } from "nats";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";
import { Ok, Error as GError } from "../../gleam.mjs";

const sc = StringCodec();

export const connect = (url) =>
  natsConnect({ servers: url }).then((nc) => new Ok(nc), (e) => new GError(e));
export const publish = (nc, subject, data) => {
  nc.publish(subject, sc.encode(data));
};
export const flush = (nc) => nc.flush().then(() => undefined);
export const subscribe = (nc, subject, handler) => {
  const sub = nc.subscribe(subject);
  (async () => {
    for await (const m of sub) {
      try {
        await handler(sc.decode(m.data));
      } catch (e) {
        console.error(`[nats:${subject}] handler failed:`, e);
      }
    }
  })().catch(e => console.error(`[nats:${subject}] subscriber failed:`, e));
  return sub;
};
export const unsubscribe = (sub) => {
  try {
    sub.unsubscribe();
  } catch {}
};
export const request = (nc, subject, data, timeout) =>
  nc.request(subject, sc.encode(data), { timeout }).then(
    (m) => new Ok(sc.decode(m.data)),
    (e) => new GError(e),
  );
export const drain = (nc) => nc.drain().then(() => undefined);

const iterators = new WeakMap();
export const subscribeRaw = (nc,subject) => nc.subscribe(subject);
export const nextMessage = async sub => {
  try {
    let iterator=iterators.get(sub);
    if(!iterator){iterator=sub[Symbol.asyncIterator]();iterators.set(sub,iterator);}
    const value=await iterator.next();
    return new Ok(value.done ? new None() : new Some(sc.decode(value.value.data)));
  } catch(error) {return new GError(error);}
};
