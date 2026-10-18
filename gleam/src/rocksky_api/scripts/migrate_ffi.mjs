import { Ok, Error as GError } from "../../gleam.mjs";
export const parseJson = (s) => {
  try {
    return new Ok(JSON.parse(s));
  } catch {
    return new GError(undefined);
  }
};
