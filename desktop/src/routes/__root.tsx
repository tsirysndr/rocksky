import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import * as React from "react";
import { themeAtom } from "../atoms/theme";
import AddToPlaylistPalette from "../components/AddToPlaylistPalette";
import CreatePlaylistModal from "../components/CreatePlaylistModal";
import KeyboardShortcuts from "../components/KeyboardShortcuts";
import LibraryPlaylistModal from "../components/LibraryPlaylistModal";
import StickyPlayer from "../components/StickyPlayer";
import LibrarySearchModal from "../layouts/Search/LibrarySearchModal";
import SearchModal from "../layouts/Search/SearchModal";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { darkMode } = useAtomValue(themeAtom);

  React.useEffect(() => {
    // Also on <html>: baseui mounts popovers/menus/modals into a Layer that can
    // land on document.body, outside #root. With the class only on #root those
    // resolve the light :root variables and stay light whatever the app theme
    // is. The variables are declared on :root, so classing <html> covers the
    // whole document, portals included.
    const root = document.getElementById("root");
    for (const el of [document.documentElement, root]) {
      if (darkMode) el?.classList.add("dark");
      else el?.classList.remove("dark");
    }

    // Keep the PWA window / mobile browser chrome the same colour as the app's
    // background for the active theme (light #ffffff, dark #130825 — see
    // --color-background in index.css).
    const bg = darkMode ? "#130825" : "#ffffff";
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = bg;

    // The `.dark` class lives on #root, so html/body (outside #root) never get
    // the themed --color-background and stay white. That white shows through on
    // overscroll / rubber-band at the top of a scroll container. Paint the root
    // elements with the active theme colour so the bounce area matches.
    document.documentElement.style.backgroundColor = bg;
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    document.body.style.backgroundColor = bg;
  }, [darkMode]);

  return (
    <React.Fragment>
      <Outlet />
      <StickyPlayer />
      <KeyboardShortcuts />
      <SearchModal />
      <LibrarySearchModal />
      <CreatePlaylistModal />
      <LibraryPlaylistModal />
      <AddToPlaylistPalette />
    </React.Fragment>
  );
}
