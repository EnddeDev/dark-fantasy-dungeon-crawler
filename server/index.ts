import { createServer } from "node:http";
import { Db } from "./db";
import { HttpError, readBody, send, type Ctx } from "./http";
import {
  handleAuth,
  handleChat,
  handleDuels,
  handleFriends,
  handleMarket,
  handleMe,
  handlePlayers,
  handleTrades,
} from "./api";

const PORT = Number(process.env.PORT ?? 8787);
const DB_FILE = process.env.DB_FILE ?? "server/data/sumrak.db";

const db = new Db(DB_FILE);

const routes: { method: string; re: RegExp; keys: string[]; run: (ctx: Ctx, db: Db, p: Record<string, string>) => unknown }[] = [
  { method: "GET", re: /^\/api\/health$/, keys: [], run: () => ({ ok: true, service: "sumrak-api" }) },
  { method: "POST", re: /^\/api\/auth\/(register|login|logout)$/, keys: ["action"], run: (ctx, d, p) => handleAuth(ctx, d, p.action) },
  { method: "GET", re: /^\/api\/me$/, keys: [], run: (ctx, d) => handleMe(ctx, d, "GET") },
  { method: "PUT", re: /^\/api\/me$/, keys: [], run: (ctx, d) => handleMe(ctx, d, "PUT") },
  { method: "GET", re: /^\/api\/players$/, keys: [], run: (ctx, d) => handlePlayers(ctx, d) },
  { method: "GET", re: /^\/api\/friends$/, keys: [], run: (ctx, d) => handleFriends(ctx, d, "GET") },
  { method: "POST", re: /^\/api\/friends$/, keys: [], run: (ctx, d) => handleFriends(ctx, d, "POST") },
  { method: "DELETE", re: /^\/api\/friends\/([\w-]+)$/, keys: ["id"], run: (ctx, d, p) => handleFriends({ ...ctx, params: p }, d, "DELETE") },
  { method: "GET", re: /^\/api\/market$/, keys: [], run: (ctx, d) => handleMarket(ctx, d, "GET", null) },
  { method: "POST", re: /^\/api\/market$/, keys: [], run: (ctx, d) => handleMarket(ctx, d, "POST", null) },
  { method: "POST", re: /^\/api\/market\/([\w-]+)$/, keys: ["id"], run: (ctx, d, p) => handleMarket(ctx, d, "POST", p.id) },
  { method: "DELETE", re: /^\/api\/market\/([\w-]+)$/, keys: ["id"], run: (ctx, d, p) => handleMarket(ctx, d, "DELETE", p.id) },
  { method: "GET", re: /^\/api\/trades$/, keys: [], run: (ctx, d) => handleTrades(ctx, d, "GET", null, null) },
  { method: "POST", re: /^\/api\/trades$/, keys: [], run: (ctx, d) => handleTrades(ctx, d, "POST", null, null) },
  { method: "POST", re: /^\/api\/trades\/([\w-]+)\/(accept|decline|cancel|counter)$/, keys: ["id", "action"], run: (ctx, d, p) => handleTrades(ctx, d, "POST", p.id, p.action) },
  { method: "GET", re: /^\/api\/duels$/, keys: [], run: (ctx, d) => handleDuels(ctx, d, "GET", null, null) },
  { method: "POST", re: /^\/api\/duels$/, keys: [], run: (ctx, d) => handleDuels(ctx, d, "POST", null, null) },
  { method: "GET", re: /^\/api\/duels\/([\w-]+)$/, keys: ["id"], run: (ctx, d, p) => handleDuels(ctx, d, "GET", p.id, null) },
  { method: "POST", re: /^\/api\/duels\/([\w-]+)\/(accept|decline|cancel|action)$/, keys: ["id", "action"], run: (ctx, d, p) => handleDuels(ctx, d, "POST", p.id, p.action) },
  { method: "GET", re: /^\/api\/chat\/global$/, keys: [], run: (ctx, d) => handleChat(ctx, d, "GET", "global", null) },
  { method: "POST", re: /^\/api\/chat\/global$/, keys: [], run: (ctx, d) => handleChat(ctx, d, "POST", "global", null) },
  { method: "GET", re: /^\/api\/chat\/dm\/([\w-]+)$/, keys: ["peer"], run: (ctx, d, p) => handleChat(ctx, d, "GET", "dm", p.peer) },
  { method: "POST", re: /^\/api\/chat\/dm\/([\w-]+)$/, keys: ["peer"], run: (ctx, d, p) => handleChat(ctx, d, "POST", "dm", p.peer) },
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    send(res, 204);
    return;
  }

  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null;

  try {
    for (const route of routes) {
      if (route.method !== method) continue;
      const match = route.re.exec(url.pathname);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => (params[key] = match[i + 1]));
      const body = method === "GET" || method === "DELETE" ? {} : await readBody(req);
      const ctx: Ctx = { req, res, url, params, body, token };
      const data = await Promise.resolve(route.run(ctx, db, params));
      send(res, 200, data);
      return;
    }
    send(res, 404, { error: "Маршрут не найден" });
  } catch (error) {
    if (error instanceof HttpError) {
      send(res, error.status, { error: error.message });
      return;
    }
    console.error("[api]", error);
    send(res, 500, { error: "Внутренняя ошибка сервера" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`СУМРАК API слушает http://0.0.0.0:${PORT} (БД: ${DB_FILE})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
