import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { LangProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { listenForStaleChunks } from "./lib/staleChunk";
import { MaintenanceScreen } from "./components/MaintenanceScreen";

listenForStaleChunks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LangProvider>
        <BrowserRouter>
          <ErrorBoundary variant="screen">
            <AuthProvider>
              <App />
              <MaintenanceScreen />
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </LangProvider>
    </ThemeProvider>
  </StrictMode>,
);
