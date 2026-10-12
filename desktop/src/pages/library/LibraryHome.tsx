import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { remoteLibraries } from "../../api/remoteLibraries";
import { isTauri } from "../../lib/tauri";
import UploadedLibrary from "./Library";
import LibrarySwitcher from "./LibrarySwitcher";
import LocalLibrary from "./LocalLibrary";
import RemoteLibrary from "./RemoteLibrary";

const STORAGE_KEY = "library:source";

export default function LibraryHome() {
  const [source, setSource] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "uploaded",
  );
  const libraries = useQuery({
    queryKey: ["remote-libraries"],
    queryFn: remoteLibraries.list,
    enabled: isTauri(),
  });
  const remote = libraries.data?.sources.find((s) => s.id === source);
  const selected = remote ? source : source === "local" && isTauri() ? "local" : "uploaded";
  const select = (id: string) => {
    setSource(id);
    localStorage.setItem(STORAGE_KEY, id);
  };
  const switcher = isTauri() ? (
    <LibrarySwitcher selected={selected} onSelect={select} />
  ) : null;
  return remote ? (
    <RemoteLibrary key={remote.id} source={remote} sourceSwitcher={switcher} />
  ) : selected === "local" ? (
    <LocalLibrary sourceSwitcher={switcher} />
  ) : (
    <UploadedLibrary sourceSwitcher={switcher} />
  );
}
