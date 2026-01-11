import { env } from "lib/env";
import crypto from "node:crypto";

export function generateLastfmSignature(
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  let signatureString = "";
  for (const key of sortedKeys) {
    if (key !== "format" && key !== "callback") {
      signatureString += key + params[key];
    }
  }
  signatureString += env.ROCKSKY_SHARED_SECRET;
  return crypto.createHash("md5").update(signatureString, "utf8").digest("hex");
}

export function validateLastfmSignature(
  params: Record<string, string>,
): boolean {
  const providedSignature = params.api_sig;
  if (!providedSignature) return false;

  const expectedSignature = generateLastfmSignature(params);
  return providedSignature === expectedSignature;
}
