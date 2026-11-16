import sharp from "sharp";
import type { Db } from "./db";
import { sessionUser, type UserRow } from "./auth";
import { HttpError, readRaw, RESPONDED, type Ctx } from "./http";

/**
 * Портрет игрока: квадрат 256×256 в WEBP. Клиент присылает любую JPEG/PNG/WEBP,
 * сервер поворачивает по EXIF, обрезает по центру и сохраняет результат в таблицу portraits.
 * Модерации нет: портрет виден сразу, владелец может заменить или удалить его.
 */
export const PORTRAIT_SIZE = 256;
export const PORTRAIT_MAX_UPLOAD = 2_000_000;
/** Защита памяти: больше таких картинок sharp не декодирует. */
const MAX_INPUT_PIXELS = 25_000_000;

type Kind = "jpeg" | "png" | "webp";

/** Тип файла по сигнатуре, а не по заявленному Content-Type. */
export function detectImage(buf: Buffer): Kind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/** Квадрат 256×256 в WEBP. Ошибки декодирования превращаем в понятный ответ 415. */
export async function makePortrait(input: Buffer): Promise<Buffer> {
  if (!detectImage(input)) throw new HttpError(415, "Нужна картинка JPEG, PNG или WEBP");
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new HttpError(415, "Не удалось прочитать картинку");
  }
}

type PortraitRow = { data: Uint8Array; updated_at: number | bigint };

/** Версия портрета для клиента (время загрузки) или null, если портрета нет. */
export function portraitVersion(db: Db, userId: string): number | null {
  const row = db.one<{ updated_at: number | bigint }>("SELECT updated_at FROM portraits WHERE user_id = ?", userId);
  return row ? Number(row.updated_at) : null;
}

function requireUser(db: Db, ctx: Ctx): UserRow {
  const user = sessionUser(db, ctx.token);
  if (!user) throw new HttpError(401, "Нужен вход в аккаунт");
  return user;
}

/** PUT /api/me/portrait: сырой файл картинки. */
export async function uploadPortrait(ctx: Ctx, db: Db): Promise<{ ok: true; portrait: number }> {
  const user = requireUser(db, ctx);
  const input = await readRaw(ctx.req, PORTRAIT_MAX_UPLOAD);
  if (!input.length) throw new HttpError(400, "Пустой файл");
  const data = await makePortrait(input);
  const updatedAt = Date.now();
  db.run(
    "INSERT INTO portraits (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    user.id,
    data,
    updatedAt,
  );
  return { ok: true, portrait: updatedAt };
}

/** DELETE /api/me/portrait. */
export function deletePortrait(ctx: Ctx, db: Db): { ok: true } {
  const user = requireUser(db, ctx);
  db.run("DELETE FROM portraits WHERE user_id = ?", user.id);
  return { ok: true };
}

/**
 * GET /api/players/:id/portrait: картинка WEBP. Открытая: тег <img> не умеет слать
 * Authorization, а портрет и так виден всем. Кэш по версии через ETag.
 */
export function getPortrait(ctx: Ctx, db: Db, target: string): typeof RESPONDED {
  const row = db.one<PortraitRow>("SELECT data, updated_at FROM portraits WHERE user_id = ?", target);
  if (!row) throw new HttpError(404, "Портрета нет");
  const etag = `"${Number(row.updated_at)}"`;
  const headers = {
    "Content-Type": "image/webp",
    "Cache-Control": "private, no-cache",
    ETag: etag,
    "Access-Control-Allow-Origin": "*",
  };
  if (ctx.req.headers["if-none-match"] === etag) {
    ctx.res.writeHead(304, headers);
    ctx.res.end();
    return RESPONDED;
  }
  ctx.res.writeHead(200, { ...headers, "Content-Length": String(row.data.byteLength) });
  ctx.res.end(Buffer.from(row.data));
  return RESPONDED;
}
