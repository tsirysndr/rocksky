import * as jose from "jose";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export const importJWKImpl = (jwk) => (alg) => () => jose.importJWK(jwk, alg ?? undefined);
export const exportJWKImpl = (k) => () => jose.exportJWK(k);
export const generateKeyPairImpl = (alg) => (o) => () => jose.generateKeyPair(alg, dropNulls(o));

export const newSignJWT = (payload) => () => new jose.SignJWT(payload);
export const setProtectedHeader = (j) => (h) => () => j.setProtectedHeader(dropNulls(h));
export const setIssuedAt = (j) => () => j.setIssuedAt();
export const setIssuer = (j) => (v) => () => j.setIssuer(v);
export const setAudience = (j) => (v) => () => j.setAudience(v);
export const setSubject = (j) => (v) => () => j.setSubject(v);
export const setJti = (j) => (v) => () => j.setJti(v);
export const setExpirationTime = (j) => (v) => () => j.setExpirationTime(v);
export const setNotBefore = (j) => (v) => () => j.setNotBefore(v);
export const signImpl = (j) => (k) => () => j.sign(k);

export const jwtVerifyImpl = (jwt) => (k) => (o) => () =>
  jose.jwtVerify(jwt, k, dropNulls(o)).then((r) => ({ payload: r.payload, protectedHeader: r.protectedHeader }));

export const decodeJwt = (jwt) => () => jose.decodeJwt(jwt);
export const decodeProtectedHeader = (jwt) => () => jose.decodeProtectedHeader(jwt);
