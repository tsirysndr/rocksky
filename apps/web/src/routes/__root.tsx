import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import * as React from "react";
import { themeAtom } from "../atoms/theme";
import StickyPlayer from "../components/StickyPlayer";

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
  }, [darkMode]);

  return (
    <React.Fragment>
      <Outlet />
      <StickyPlayer />
    </React.Fragment>
  );
}
