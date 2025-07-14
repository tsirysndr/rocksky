import { client } from ".";

export const getFiles = async (parent_id?: string) => {
  const response = await client.get<{
    parentDirectory: {
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
  }>("/xrpc/app.rocksky.googledrive.getFiles", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    params: {
      at: parent_id,
    },
  });
  return response.data;
};

export const getFile = async (id: string) => {
  const response = await client.get<{
    id: string;
    mimeType: string;
    name: string;
    parents: string[];
  }>("/xrpc/app.rocksky.googledrive.getFile", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    params: {
      id,
    },
  });
  return response.data;
};
