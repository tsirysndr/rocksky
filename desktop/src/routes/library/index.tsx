import { createFileRoute, redirect } from "@tanstack/react-router";
import { Library, type LibraryTab, isLibraryTab } from "../../pages/library";

export const Route = createFileRoute("/library/")({
  // ?tab= names the tab to open on. Unknown values are dropped rather than
  // rejected: a stale link should land on the library, not on an error.
  validateSearch: (search: Record<string, unknown>): { tab?: LibraryTab } =>
    isLibraryTab(search.tab) ? { tab: search.tab } : {},
  beforeLoad: () => {
    if (!localStorage.getItem("token")) {
      throw redirect({ to: "/" });
    }
  },
  component: Library,
});
