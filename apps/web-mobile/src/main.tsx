import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import "./index.css";

dayjs.extend(relativeTime);
dayjs.extend(utc);

const primitives = { primaryFontFamily: "RockfordSansRegular" };
const theme = createLightTheme(primitives);
const engine = new Styletron();
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

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
