import { atom } from "jotai";
import type { t as ApiKey } from "../types/ApiKey.gen";

export const apiKeysAtom = atom<ApiKey[]>([]);
