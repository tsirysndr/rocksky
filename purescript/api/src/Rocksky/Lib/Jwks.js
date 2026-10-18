import { createPublicKey } from "node:crypto";

// Only public asymmetric keys may be exposed by the OAuth JWKS endpoint.
export function parseJwks(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.keys)) throw new Error();
    const kids = new Set();
    for (const key of value.keys) {
      if (!key || !["EC", "RSA", "OKP"].includes(key.kty) ||
          typeof key.kid !== "string" || !key.kid || kids.has(key.kid) ||
          ["d", "p", "q", "dp", "dq", "qi", "oth", "k"].some(field => field in key)) throw new Error();
      createPublicKey({ key, format: "jwk" });
      kids.add(key.kid);
    }
    return { keys: value.keys };
  } catch {
    throw new Error("JWKS_JSON must contain a valid public JWK set with unique key IDs and no private key material");
  }
}
