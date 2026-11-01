import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // Относительные пути работают и в корне домена, и на GitHub Pages в подпапке репозитория.
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    // Клиент ходит по относительному /api: так браузер не зависит от localhost и превью.
    proxy: { "/api": { target: process.env.API_PROXY ?? "http://127.0.0.1:8787", changeOrigin: true } },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    proxy: { "/api": { target: process.env.API_PROXY ?? "http://127.0.0.1:8787", changeOrigin: true } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
