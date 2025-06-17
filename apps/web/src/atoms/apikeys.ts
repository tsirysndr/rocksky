import { atom } from "jotai";
import { ApiKey } from "../types/apikey";

export const apiKeysAtom = atom<ApiKey[]>([]);
