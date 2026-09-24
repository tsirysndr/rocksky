import { syncHomepageSession } from "../../shared/browser-session";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "jotai";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 15_000, refetchOnWindowFocus: true },
  },
});

if (!syncHomepageSession("landing"))
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Provider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </Provider>
    </React.StrictMode>,
  );
