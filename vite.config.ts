import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * В сборку для сайта попадают только OGG из звукового пака: игра играет именно их.
 * WAV-копии того же пака (около 275 МБ) лежат в репозитории, но в dist не нужны.
 */
const dropUnusedPackWav = {
  name: "drop-unused-pack-wav",
  apply: "build" as const,
  writeBundle(options: { dir?: string }) {
    const dir = options.dir ?? path.resolve(__dirname, "dist");
    const music = path.join(dir, "music");
    if (!fs.existsSync(music)) return;
    for (const pack of fs.readdirSync(music)) {
      const wav = path.join(music, pack, "WAV Files");
      if (fs.existsSync(wav)) fs.rmSync(wav, { recursive: true, force: true });
    }
  },
};

// https://vite.dev/config/
export default defineConfig({
  // Относительные пути работают и в корне домена, и на GitHub Pages в подпапке репозитория.
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile(), dropUnusedPackWav],
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
