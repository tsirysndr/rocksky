import { useQuery } from "@tanstack/react-query";
import { getFile, getFiles } from "../api/googledrive";

export const useFilesQuery = (id?: string) =>
  useQuery({
    queryKey: ["googledrive", "files", id],
    queryFn: () => getFiles(id),
  });

export const useFileQuery = (id: string) =>
  useQuery({
    queryKey: ["googledrive", "file", id],
    queryFn: () => getFile(id),
  });
