/** Минимальный HTTP-слой: CORS, JSON, разбор тела и маршрутов. */
export interface Ctx {
  req: import("node:http").IncomingMessage;
  res: import("node:http").ServerResponse;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  token: string | null;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function send(res: import("node:http").ServerResponse, status: number, data?: unknown): void {
  const body = data === undefined ? "" : JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > 1_000_000) throw new HttpError(413, "Слишком большой запрос");
    chunks.push(buf);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
}

/** Строгий доступ к полю тела: клиент не должен присылать мусор в БД. */
export function field<T>(body: unknown, key: string): T | undefined {
  if (!body || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[key] as T | undefined;
}

export function text(body: unknown, key: string, max = 200): string {
  const value = field<unknown>(body, key);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function num(body: unknown, key: string): number {
  const value = field<unknown>(body, key);
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}
