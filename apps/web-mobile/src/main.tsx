import { syncHomepageSession } from "../../shared/browser-session";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { BaseProvider, createLightTheme } from "baseui";
import { PLACEMENT, SnackbarProvider } from "baseui/snackbar";
import { ToasterContainer } from "baseui/toast/toaster";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { createRoot } from "react-dom/client";
import { Client as Styletron } from "styletron-engine-monolithic";
import { Provider as StyletronProvider } from "styletron-react";
import App from "./App.tsx";
import { client } from "./api";
import {
  handleSessionExpired,
  installSessionGuard,
  isPdsSessionExpired,
} from "./lib/sessionExpired";
import "./index.css";

dayjs.extend(relativeTime);
dayjs.extend(utc);

const primitives = { primaryFontFamily: "RockfordSansRegular" };
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
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});

if (!syncHomepageSession("app"))
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <StyletronProvider value={engine}>
        <BaseProvider theme={theme}>
          <ToasterContainer placement={PLACEMENT.bottom}>
            <SnackbarProvider placement={PLACEMENT.bottom}>
              <App />
            </SnackbarProvider>
          </ToasterContainer>
        </BaseProvider>
      </StyletronProvider>
    </QueryClientProvider>,
  );
