import { BaseProvider, createLightTheme } from "baseui";
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

createRoot(document.getElementById("root")!).render(
  //<StrictMode>
  <StyletronProvider value={engine}>
    <BaseProvider theme={theme}>
      <App />
    </BaseProvider>
  </StyletronProvider>
  //</StrictMode>
);
