import { atom } from "jotai";

export const dropboxAtom = atom<{
  current_path: string;
  parent_id?: string;
  cache: Record<
    string,
    {
      ".tag": string;
      id: string;
      name: string;
      path_display: string;
    }[]
  >;
} | null>(null);
