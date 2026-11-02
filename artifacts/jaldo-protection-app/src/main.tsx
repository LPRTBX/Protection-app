import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@workspace/design/tokens/theme.css";
import "./styles.css";
import { App } from "./ui/App";

// Follow the person's colour-scheme preference using the approved light and dark tokens.
try {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("dark");
} catch {
  /* light tokens apply */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
