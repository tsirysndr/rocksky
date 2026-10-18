import { connect as natsConnect, StringCodec } from "nats";

const sc = StringCodec();

export const connectImpl = (servers) => () => natsConnect({ servers });
export const publish = (nc) => (subject) => (buf) => () => nc.publish(subject, buf);
export const publishString = (nc) => (subject) => (s) => () => nc.publish(subject, sc.encode(s));
export const subscribeImpl = (nc, subject, f) => {
  const sub = nc.subscribe(subject);
  (async () => {
    for await (const m of sub) {
      try {
        f(m);
      } catch (e) {
        console.error(`${subject} handler error:`, e);
      }
    }
  })().catch((e) => console.error(`${subject} subscriber crashed:`, e));
  return sub;
};
export const flushImpl = (nc) => () => nc.flush();
export const closeImpl = (nc) => () => nc.close();
export const msgData = (m) => Buffer.from(m.data);
export const msgSubject = (m) => m.subject;
export const decodeString = (m) => sc.decode(m.data);

const iterators = new WeakMap();
export const subscribePull = nc => subject => () => {
  const sub = nc.subscribe(subject);
  iterators.set(sub, sub[Symbol.asyncIterator]());
  return sub;
};
export const nextMessageImpl = sub => () => iterators.get(sub).next().then(result => result.done ? null : result.value);
export const unsubscribe = sub => () => sub.unsubscribe();
