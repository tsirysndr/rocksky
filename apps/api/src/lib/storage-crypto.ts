import sodium from "libsodium-wrappers";
import { env } from "./env";

async function getKey(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.from_hex(env.STORAGE_ENCRYPTION_KEY);
}

export async function encryptCredential(plaintext: string): Promise<string> {
  await sodium.ready;
  const key = await getKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return sodium.to_base64(combined);
}

export async function decryptCredential(encoded: string): Promise<string> {
  await sodium.ready;
  const key = await getKey();
  const combined = sodium.from_base64(encoded);
  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  if (!plaintext) throw new Error("Decryption failed");
  return sodium.to_string(plaintext);
}
