import crypto from "node:crypto";
import sodium from "libsodium-wrappers";
import { Ok, Error as GError } from "../../gleam.mjs";

export const sha256Hex = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const sha256HexBytes = (b) =>
  crypto.createHash("sha256").update(Buffer.from(b.rawBuffer ?? b.buffer)).digest("hex");
export const md5Hex = (s) => crypto.createHash("md5").update(s).digest("hex");
export const randomBytesHex = (n) => crypto.randomBytes(n).toString("hex");
export const randomBytesBase64Url = (n) => crypto.randomBytes(n).toString("base64url");
export const randomUuid = () => crypto.randomUUID();
export const timingSafeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export const aesCtrEncrypt = (text, keyHex, ivHex) => {
  try {
    const cipher = crypto.createCipheriv(
      "aes-256-ctr",
      Buffer.from(keyHex, "hex"),
      Buffer.from(ivHex, "hex"),
    );
    return new Ok(Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("hex"));
  } catch (e) {
    return new GError(e);
  }
};
export const aesCtrDecrypt = (enc, keyHex, ivHex) => {
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-ctr",
      Buffer.from(keyHex, "hex"),
      Buffer.from(ivHex, "hex"),
    );
    return new Ok(
      Buffer.concat([decipher.update(Buffer.from(enc, "hex")), decipher.final()]).toString("utf8"),
    );
  } catch (e) {
    return new GError(e);
  }
};
export const hmacSha256Hex = (key, data) =>
  crypto.createHmac("sha256", key).update(data).digest("hex");

export const secretboxEncrypt = async (plaintext, keyHex) => {
  try {
    await sodium.ready;
    const key = sodium.from_hex(keyHex);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);
    const combined = new Uint8Array(nonce.length + ciphertext.length);
    combined.set(nonce);
    combined.set(ciphertext, nonce.length);
    return new Ok(sodium.to_base64(combined));
  } catch (e) {
    return new GError(e);
  }
};
export const secretboxDecrypt = async (encoded, keyHex) => {
  try {
    await sodium.ready;
    const key = sodium.from_hex(keyHex);
    const combined = sodium.from_base64(encoded);
    const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
    if (!plaintext) throw new Error("Decryption failed");
    return new Ok(sodium.to_string(plaintext));
  } catch (e) {
    return new GError(e);
  }
};
