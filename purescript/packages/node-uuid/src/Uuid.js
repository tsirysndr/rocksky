import { NIL, v4 as uuidv4, v7 as uuidv7, validate as uuidValidate, version as uuidVersion } from "uuid";

export const v4 = () => uuidv4();
export const v7 = () => uuidv7();
export const validate = (s) => uuidValidate(s);
export const version = (s) => (uuidValidate(s) ? uuidVersion(s) : 0);
export const nil = NIL;
