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
    if (darkMode) {
      root!.classList.add("dark");
      return;
    }
    root!.classList.remove("dark");
  }, [darkMode]);

  return (
    <React.Fragment>
      <Outlet />
      <StickyPlayer />
    </React.Fragment>
  );
}
