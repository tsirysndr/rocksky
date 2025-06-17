import { atom } from "jotai";

const googleDriveAtom = atom<{
  current_dir: string;
  parent_dir?: string;
  parent_id?: string;
  cache: Record<
    string,
    {
      parent_id?: string;
      parent_dir?: string;
      current_dir?: string;
      files: {
        id: string;
        name: string;
        mime_type: string;
        parents: string[];
      }[];
    }
  >;
} | null>(null);

export default googleDriveAtom;
