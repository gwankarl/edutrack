import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/global.css";

import App from "./App.js";
import QueryProvider from "./providers/QueryProvider.js";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
);
