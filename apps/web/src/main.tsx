import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
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
import { client } from "./api";
import {
  handleSessionExpired,
  installSessionGuard,
  isPdsSessionExpired,
} from "./lib/sessionExpired";
import "./index.css";
import { routeTree } from "./routeTree.gen.ts";

dayjs.extend(relativeTime);
dayjs.extend(utc);

const primitives = {
  primaryFontFamily: "RockfordSansRegular",
};

const theme = createLightTheme(primitives);
const engine = new Styletron();

installSessionGuard(client);

// The SDK throws instead of going through axios, so react-query's caches are
// what catch that half: every `rocksky()` call site runs under a query or a
// mutation.
const onError = (error: unknown) => {
  if (isPdsSessionExpired(error)) handleSessionExpired();
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});

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
                disable_surveys: true,
              }}
            >
              <RouterProvider router={router} />
            </PostHogProvider>
          </SnackbarProvider>
        </ToasterContainer>
      </BaseProvider>
    </StyletronProvider>
  </QueryClientProvider>,
  //</StrictMode>
);
