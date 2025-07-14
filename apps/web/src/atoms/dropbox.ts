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
    }
  >;
} | null>(null);
