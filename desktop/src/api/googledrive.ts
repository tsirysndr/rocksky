import { rocksky } from "../lib/rocksky";

export const getFiles = async (parent_id?: string) => {
  const response = (await rocksky().get("app.rocksky.googledrive.getFiles", {
    at: parent_id,
  })) as {
    parentDirectory: {
      id: string;
      name: string;
      path: string;
      fileId: string;
    };
    directory: {
      id: string;
      name: string;
      path: string;
      fileId: string;
    };
    directories: {
      id: string;
      name: string;
      fileId: string;
      path: string;
      parentId?: string;
    }[];
    files: {
      id: string;
      name: string;
      fileId: string;
      directoryId: string;
      trackId: string;
    }[];
  };
  return response;
};

export const getFile = async (id: string) => {
  const response = (await rocksky().get("app.rocksky.googledrive.getFile", {
    id,
  })) as {
    id: string;
    mimeType: string;
    name: string;
    parents: string[];
  };
  return response;
};
