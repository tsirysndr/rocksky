import crypto from "crypto";
import { env } from "./env";

export function encrypt(text: string, key: string) {
  const iv = Buffer.from(env.SPOTIFY_ENCRYPTION_IV, "hex");
  const cipher = crypto.createCipheriv(
    "aes-256-ctr",
    Buffer.from(key, "hex"),
    iv
  );
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
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
  return decrypted.toString();
}
