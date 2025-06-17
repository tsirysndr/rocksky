import { atom } from "jotai";

export const dropboxAtom = atom<{
  current_dir: string;
  parent_dir?: string;
  parent_id?: string;
  cache: Record<
    string,
    {
      current_dir?: string;
      parent_dir?: string;
      parent_id?: string;
      files: {
        ".tag": string;
        id: string;
        name: string;
        path_display: string;
      }[];
    }
  >;
} | null>(null);
