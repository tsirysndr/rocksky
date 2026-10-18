import sodium from "libsodium-wrappers";

const buf = (u8) => (Buffer.isBuffer(u8) ? u8 : Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength));

export const readyImpl = () => sodium.ready.then(() => undefined);
export const cryptoSecretboxNonceBytes = () => sodium.crypto_secretbox_NONCEBYTES;
export const cryptoSecretboxKeyBytes = () => sodium.crypto_secretbox_KEYBYTES;
export const cryptoSecretboxMacBytes = () => sodium.crypto_secretbox_MACBYTES;
export const randombytesBuf = (n) => () => buf(sodium.randombytes_buf(n));
export const cryptoSecretboxEasy = (m) => (nonce) => (key) => () => buf(sodium.crypto_secretbox_easy(m, nonce, key));
export const cryptoSecretboxEasyString = (m) => (nonce) => (key) => () =>
  buf(sodium.crypto_secretbox_easy(m, nonce, key));
export const cryptoSecretboxOpenEasy = (c) => (nonce) => (key) => () =>
  buf(sodium.crypto_secretbox_open_easy(c, nonce, key));
export const cryptoSecretboxKeygen = () => buf(sodium.crypto_secretbox_keygen());
export const fromHex = (s) => () => buf(sodium.from_hex(s));
export const toHex = (b) => () => sodium.to_hex(b);
export const fromBase64 = (s) => () => buf(sodium.from_base64(s));
export const toBase64 = (b) => () => sodium.to_base64(b);
export const fromString = (s) => () => buf(sodium.from_string(s));
export const toString = (b) => () => sodium.to_string(b);
