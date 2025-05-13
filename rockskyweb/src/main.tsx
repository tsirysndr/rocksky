import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BaseProvider, createLightTheme } from "baseui";
import { PLACEMENT, SnackbarProvider } from "baseui/snackbar";
import { ToasterContainer } from "baseui/toast/toaster";
import { PostHogProvider } from "posthog-js/react";
import { createRoot } from "react-dom/client";
import { Client as Styletron } from "styletron-engine-monolithic";
import { Provider as StyletronProvider } from "styletron-react";
import App from "./App.tsx";
import "./index.css";

const primitives = {
  primaryFontFamily: "RockfordSansRegular",
};

const theme = createLightTheme(primitives);
const engine = new Styletron();

const queryClient = new QueryClient();

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
              <App />
            </PostHogProvider>
          </SnackbarProvider>
        </ToasterContainer>
      </BaseProvider>
    </StyletronProvider>
  </QueryClientProvider>
  //</StrictMode>
);
