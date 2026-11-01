import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { OnlineProvider } from "./net/online";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OnlineProvider>
      <App />
    </OnlineProvider>
  </StrictMode>
);
