import { parseArgs as parse } from "node:util";
export const parseArgs = options => () => parse(options);

export const localeCompare = a => b => a.localeCompare(b);

export const parseInt10 = value => parseInt(value, 10);
