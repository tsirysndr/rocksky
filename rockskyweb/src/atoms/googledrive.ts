import { atom } from "jotai";

const googleDriveAtom = atom<{
  current_folder: string;
  cache: Record<
    string,
    {
      id: string;
      name: string;
      mime_type: string;
      parents: string[];
    }[]
  >;
  parent_id?: string;
} | null>(null);

export default googleDriveAtom;
