import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { librarySourceAtom } from "../../atoms/librarySource";
import { CoverFlowButton } from "./CoverFlow";
import { remoteLibraries } from "../../api/remoteLibraries";
import { isTauri } from "../../lib/tauri";
import UploadedLibrary from "./Library";
import LibrarySwitcher from "./LibrarySwitcher";
import LocalLibrary from "./LocalLibrary";
import RemoteLibrary from "./RemoteLibrary";


export default function LibraryHome() {
  const [source, setSource] = useAtom(librarySourceAtom);
  const libraries = useQuery({
    queryKey: ["remote-libraries"],
    queryFn: remoteLibraries.list,
    enabled: isTauri(),
  });
  const remote = libraries.data?.sources.find((s) => s.id === source);
  const selected = remote ? source : source === "local" && isTauri() ? "local" : "uploaded";
  const select = (id: string) => {
    setSource(id);
  };
  const switcher = <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {isTauri() && <LibrarySwitcher selected={selected} onSelect={select} />}
    <CoverFlowButton />
  </div>;
  return remote ? (
    <RemoteLibrary key={remote.id} source={remote} sourceSwitcher={switcher} />
  ) : selected === "local" ? (
    <LocalLibrary sourceSwitcher={switcher} />
  ) : (
    <UploadedLibrary sourceSwitcher={switcher} />
  );
}
