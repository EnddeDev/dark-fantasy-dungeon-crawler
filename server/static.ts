import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Раздача собранной игры тем же сервером, что держит API.
 * Так один деплой даёт и клиент, и бэкенд: относительный /api работает без настройки
 * VITE_API_URL, а GitHub Pages остаётся статической соло-версией.
 */
export function createStaticHandler(rootDir: string) {
  const root = resolve(rootDir);
  const indexFile = join(root, "index.html");

  return function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
    if (!existsSync(indexFile)) return false;
    const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (pathname === "/api" || pathname.startsWith("/api/")) return false;

    const relative = normalize(pathname).replace(/^([/\\])+/, "");
    const candidate = resolve(root, relative);
    // Защита от выхода за пределы dist: .. и абсолютные пути недопустимы.
    if (candidate !== root && !candidate.startsWith(root + sep)) return false;

    let file = candidate;
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // Одностраничное приложение: неизвестные пути отдают index.html.
      file = indexFile;
    }

    const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
    const immutable = file !== indexFile && /-[A-Za-z0-9_]{8,}\.(js|css)$/.test(file);
    res.writeHead(200, {
      "Content-Type": type,
      // index.html не кэшируем, чтобы обновления игры доезжали сразу.
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-store",
    });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    createReadStream(file).pipe(res);
    return true;
  };
}
