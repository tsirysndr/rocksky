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

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

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
              }}
            >
              <RouterProvider router={router} />
            </PostHogProvider>
          </SnackbarProvider>
        </ToasterContainer>
      </BaseProvider>
    </StyletronProvider>
  </QueryClientProvider>
  //</StrictMode>
);
