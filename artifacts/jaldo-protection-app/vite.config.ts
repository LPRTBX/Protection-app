import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Simulation only: no proxy, no API, no environment secrets. PORT/BASE_PATH come from the workflow; the defaults let
// `vite build` and `vite preview` work from a shell.
const port = Number(process.env.PORT ?? "23582");
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
const basePath = process.env.BASE_PATH ?? "/protection-app/";

export default defineConfig({
  base: basePath,
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  root: path.resolve(import.meta.dirname),
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
  server: { port, strictPort: true, host: "0.0.0.0", allowedHosts: true },
  preview: { port, host: "0.0.0.0", allowedHosts: true },
});
