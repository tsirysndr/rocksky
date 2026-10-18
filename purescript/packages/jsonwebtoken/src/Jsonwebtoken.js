import jwt from "jsonwebtoken";

export const sign = (payload) => (secret) => jwt.sign(payload, secret);
export const verifyImpl = (left) => (right) => (token) => (secret) => (ignoreExpiration) => {
  try {
    return right(jwt.verify(token, secret, { ignoreExpiration }));
  } catch (e) {
    return left(e instanceof Error ? e : new Error(String(e)));
  }
};
export const decodeImpl = (token) => jwt.decode(token);
