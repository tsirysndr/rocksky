import { AtUri, isValidHandle as valid } from "@atproto/syntax";

export const parseAtUriImpl = (s) => {
  try {
    const u = new AtUri(s);
    return { host: u.host, collection: u.collection, rkey: u.rkey, href: u.href };
  } catch {
    return null;
  }
};
export const isValidHandle = (h) => valid(h);
