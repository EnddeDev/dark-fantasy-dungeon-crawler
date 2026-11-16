import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "./db";
import { sessionUser } from "./auth";
import { send } from "./http";

/**
 * Хаб событий (Server-Sent Events): держит открытые потоки игроков и
 * отправляет короткие подсказки «обновите раздел». Данные клиент берёт по API,
 * поэтому событие не несёт секретов и может потеряться без вреда.
 */
const MAX_STREAMS_PER_USER = 5;
const HEARTBEAT_MS = 25_000;

const streams = new Map<string, Set<ServerResponse>>();

export function openStream(userId: string, res: ServerResponse): boolean {
  const set = streams.get(userId) ?? new Set<ServerResponse>();
  if (set.size >= MAX_STREAMS_PER_USER) return false;
  set.add(res);
  streams.set(userId, set);
  return true;
}

export function closeStream(userId: string, res: ServerResponse): void {
  const set = streams.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) streams.delete(userId);
  publishAll("players");
}

function write(res: ServerResponse, scope: string, payload: unknown): void {
  res.write(`event: ${scope}\ndata: ${JSON.stringify(payload ?? {})}\n\n`);
}

/** Подсказка одному или нескольким игрокам. */
export function publish(userIds: string[], scope: string, payload?: unknown): void {
  for (const id of new Set(userIds)) {
    for (const res of streams.get(id) ?? []) write(res, scope, payload);
  }
}

/** Подсказка всем подключённым игрокам (общий чат, рынок). */
export function publishAll(scope: string, payload?: unknown): void {
  for (const set of streams.values()) for (const res of set) write(res, scope, payload);
}

export function streamCount(): number {
  let n = 0;
  for (const set of streams.values()) n += set.size;
  return n;
}

setInterval(() => {
  for (const set of streams.values()) for (const res of set) res.write(": ping\n\n");
}, HEARTBEAT_MS).unref();

/** Открывает поток для вошедшего игрока. Токен — в заголовке Authorization, как у остальных запросов. */
export function handleEvents(req: IncomingMessage, res: ServerResponse, db: Db, token: string | null): void {
  const user = sessionUser(db, token);
  if (!user) {
    send(res, 401, { error: "Нужен вход в аккаунт" });
    return;
  }
  if (!openStream(user.id, res)) {
    send(res, 429, { error: "Слишком много открытых вкладок" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });
  res.write("retry: 3000\n\n");
  write(res, "hello", {});
  req.on("close", () => closeStream(user.id, res));
  publishAll("players");
}
