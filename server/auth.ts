import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "./db";
import { HttpError } from "./http";

export interface UserRow {
  id: string;
  login: string;
  pass: string;
  created_at: number;
}

const LOGIN_RE = /^[a-zA-Zа-яА-Я0-9_-]{3,20}$/;
const MIN_PASSWORD = 6;

/** Пароль хранится как scrypt-хеш с индивидуальной солью: в БД нет открытых паролей. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function validateCredentials(login: string, password: string): void {
  if (!LOGIN_RE.test(login)) {
    throw new HttpError(400, "Логин: 3–20 символов, буквы, цифры, дефис или подчёркивание.");
  }
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `Пароль должен быть не короче ${MIN_PASSWORD} символов.`);
  if (password.length > 128) throw new HttpError(400, "Слишком длинный пароль.");
}

export function createSession(db: Db, userId: string): string {
  const token = randomBytes(24).toString("hex");
  const now = Date.now();
  db.run("INSERT INTO sessions (token, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)", token, userId, now, now);
  return token;
}

export function sessionUser(db: Db, token: string | null): UserRow | null {
  if (!token) return null;
  const row = db.one<{ user_id: string; seen_at: number }>("SELECT user_id, seen_at FROM sessions WHERE token = ?", token);
  if (!row) return null;
  const now = Date.now();
  if (now - row.seen_at > 1000) db.run("UPDATE sessions SET seen_at = ? WHERE token = ?", now, token);
  return db.one<UserRow>("SELECT * FROM users WHERE id = ?", row.user_id) ?? null;
}

/** Игрок онлайн, если его сессия проявляла активность в последнюю минуту. */
export function isOnline(db: Db, userId: string, now = Date.now()): boolean {
  const row = db.one<{ seen_at: number }>(
    "SELECT MAX(seen_at) AS seen_at FROM sessions WHERE user_id = ?",
    userId,
  );
  return !!row && now - Number(row.seen_at) < 60_000;
}
