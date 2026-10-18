import jwt from "jsonwebtoken";
import { Ok, Error as GError } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

const attempt = (f) => {
  try {
    return new Ok(f());
  } catch (e) {
    return new GError(e);
  }
};
export const verifyIgnoringExpiration = (token, secret) =>
  attempt(() => jwt.verify(token, secret, { ignoreExpiration: true }));
export const verify = (token, secret) => attempt(() => jwt.verify(token, secret));
export const sign = (payload, secret, expiresIn) =>
  jwt.sign(payload, secret, expiresIn instanceof Some ? { expiresIn: expiresIn[0] } : undefined);
export const decode = (token) => {
  const d = jwt.decode(token);
  return d == null ? new None() : new Some(d);
};
