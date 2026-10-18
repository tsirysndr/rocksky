import { bool, cleanEnv, email, host, json, num, port, str, url } from "envalid";

const opts = (o) => {
  const r = {};
  if (o.default !== null) r.default = o.default;
  if (o.devDefault !== null) r.devDefault = o.devDefault;
  if (o.desc !== null) r.desc = o.desc;
  if (o.choices !== null) r.choices = o.choices;
  return r;
};

export const strImpl = (o) => str(opts(o));
export const numImpl = (o) => num(opts(o));
export const boolImpl = (o) => bool(opts(o));
export const portImpl = (o) => port(opts(o));
export const hostImpl = (o) => host(opts(o));
export const urlImpl = (o) => url(opts(o));
export const emailImpl = (o) => email(opts(o));
export const jsonImpl = (o) => json(opts(o));

export const cleanEnvImpl = (spec) => () => cleanEnv(process.env, spec);
