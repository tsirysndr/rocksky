import { basename as base } from "node:path";
export const basename = (p) => base(p).replace(/\.[cm]?[jt]s$/, "");
export const clientAsPool = (client) => client;
