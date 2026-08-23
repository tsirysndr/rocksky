import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { BaseProvider, createLightTheme } from "baseui";
import { PLACEMENT, SnackbarProvider } from "baseui/snackbar";
import { ToasterContainer } from "baseui/toast/toaster";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { PostHogProvider } from "posthog-js/react";
import { createRoot } from "react-dom/client";
import { Client as Styletron } from "styletron-engine-monolithic";
import { Provider as StyletronProvider } from "styletron-react";
import "./index.css";
import { disableTextMeddling } from "./lib/no-autocorrect.ts";
import { isTauri } from "./lib/tauri.ts";
import { routeTree } from "./routeTree.gen.ts";

dayjs.extend(relativeTime);
dayjs.extend(utc);

const primitives = {
  primaryFontFamily: "RockfordSansRegular",
};

const theme = createLightTheme(primitives);
const engine = new Styletron();

const queryClient = new QueryClient();

const router = createRouter({ routeTree });

// With `titleBarStyle: "Overlay"` the window has no title-bar chrome; scoped
// rules in index.css (e.g. traffic-light clearance for the navbar) key off
// this class.
if (isTauri()) {
  document.body.classList.add("tauri-desktop");
}

// The desktop shell is a webview — keep the OS from autocorrecting /
// autocapitalizing / spellchecking handles, searches, and shouts.
disableTextMeddling();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Slim drag strip along the top of the window: the hidden title bar leaves
// no chrome to grab, so this region moves the window (and double-click zooms
// via the OS default). It must stay childless — `data-tauri-drag-region`
// applies only to the element itself, not descendants. z-index 1 keeps it
// above the app/navbar (same z, later in DOM) but below toasts/popovers
// (z-index 2).
const dragRegion = isTauri() ? (
  <div
    data-tauri-drag-region
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "28px",
      zIndex: 1,
      background: "transparent",
    }}
  />
) : null;

createRoot(document.getElementById("root")!).render(
  //<StrictMode>
  <QueryClientProvider client={queryClient}>
    <StyletronProvider value={engine}>
      <BaseProvider theme={theme}>
        <ToasterContainer placement={PLACEMENT.bottom}>
          <SnackbarProvider placement={PLACEMENT.bottom}>
            <PostHogProvider
              apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
              options={{
                api_host: "https://us.i.posthog.com",
                disable_surveys: true,
              }}
            >
              <RouterProvider router={router} />
              {dragRegion}
            </PostHogProvider>
          </SnackbarProvider>
        </ToasterContainer>
      </BaseProvider>
    </StyletronProvider>
  </QueryClientProvider>,
  //</StrictMode>
);
