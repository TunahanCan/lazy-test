import React from "react";
import ReactDOM from "react-dom/client";
import * as Tooltip from "@radix-ui/react-tooltip";
import { App } from "./App";
import { LocaleProvider } from "./i18n";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LocaleProvider>
      <Tooltip.Provider delayDuration={450}>
        <App />
      </Tooltip.Provider>
    </LocaleProvider>
  </React.StrictMode>,
);
