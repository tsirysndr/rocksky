import crypto from "node:crypto";

export const hashHex = (alg) => (s) => crypto.createHash(alg).update(s).digest("hex");
export const hashBufferHex = (alg) => (b) => crypto.createHash(alg).update(b).digest("hex");
export const randomUUID = () => crypto.randomUUID();
export const randomBytesHex = (n) => () => crypto.randomBytes(n).toString("hex");
export const randomBytes = (n) => () => crypto.randomBytes(n);
export const timingSafeEqualStrings = (a) => (b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export const createCipheriv = (alg) => (keyHex) => (ivHex) => () =>
  crypto.createCipheriv(alg, Buffer.from(keyHex, "hex"), Buffer.from(ivHex, "hex"));
export const createDecipheriv = (alg) => (keyHex) => (ivHex) => () =>
  crypto.createDecipheriv(alg, Buffer.from(keyHex, "hex"), Buffer.from(ivHex, "hex"));
export const cipherUpdateString = (c) => (input) => (inEnc) => (outEnc) => () => c.update(input, inEnc, outEnc);
export const cipherFinal = (c) => (outEnc) => () => c.final(outEnc);
export const hmacSha256Hex = (key) => (s) => crypto.createHmac("sha256", key).update(s).digest("hex");
