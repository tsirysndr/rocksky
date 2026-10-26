import { env } from "./env.js";
import crypto from "node:crypto";
function generateLastfmSignature(params) {
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
function validateLastfmSignature(params) {
  const providedSignature = params.api_sig;
  if (!providedSignature) return false;
  const expectedSignature = generateLastfmSignature(params);
  return providedSignature === expectedSignature;
}
export {
  generateLastfmSignature,
  validateLastfmSignature
};
