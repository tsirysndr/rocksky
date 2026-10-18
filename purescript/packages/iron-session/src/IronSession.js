import { sealData, unsealData } from "iron-session";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export const sealDataImpl = (data) => (o) => () => sealData(data, dropNulls(o));
export const unsealDataImpl = (seal) => (o) => () => unsealData(seal, dropNulls(o));
