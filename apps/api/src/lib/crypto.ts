import crypto from "node:crypto";
import { env } from "./env";

export function encrypt(text: string, key: string) {
  const iv = Buffer.from(env.SPOTIFY_ENCRYPTION_IV, "hex");
  const cipher = crypto.createCipheriv(
    "aes-256-ctr",
    Buffer.from(key, "hex"),
    iv
  );
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("hex");
}

export function decrypt(encrypted: string, key: string) {
  const iv = Buffer.from(env.SPOTIFY_ENCRYPTION_IV, "hex");
  const content = Buffer.from(encrypted, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-ctr",
    Buffer.from(key, "hex"),
    iv
  );
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return decrypted.toString("utf8");
}

export function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  // RFC 7636 says 43–128 chars. 32 bytes → 43-ish chars after base64url (without padding).
  const codeVerifier = base64url(crypto.randomBytes(32));

  const challenge = crypto.createHash("sha256").update(codeVerifier).digest();

  const codeChallenge = base64url(challenge);
  return { codeVerifier, codeChallenge };
}
