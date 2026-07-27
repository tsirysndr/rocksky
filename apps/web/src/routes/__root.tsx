import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import * as React from "react";
import { themeAtom } from "../atoms/theme";
import KeyboardShortcuts from "../components/KeyboardShortcuts";
import StickyPlayer from "../components/StickyPlayer";
import SearchModal from "../layouts/Search/SearchModal";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { darkMode } = useAtomValue(themeAtom);

  React.useEffect(() => {
    const root = document.getElementById("root");
    if (darkMode) root!.classList.add("dark");
    else root!.classList.remove("dark");

    // Keep the PWA window / mobile browser chrome the same colour as the app's
    // background for the active theme (light #ffffff, dark #130825 — see
    // --color-background in index.css).
    const bg = darkMode ? "#130825" : "#ffffff";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
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
    </React.Fragment>
  );
}
