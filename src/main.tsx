import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { SettingsProvider } from "./settings";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>
);
