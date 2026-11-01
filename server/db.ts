import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Player } from "../src/game/types";

/**
 * Хранилище игры: обычная SQLite-база в файле.
 * Слой умышленно тонкий: схема + типовые запросы, вся логика — в сервисах.
 */
export interface ProfileRow {
  user_id: string;
  name: string;
  level: number;
  best_floor: number;
  gold: number;
  save: string;
  updated_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  pass TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER NOT NULL,
  best_floor INTEGER NOT NULL,
  gold INTEGER NOT NULL,
  save TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL,
  offer TEXT NOT NULL,
  request TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS market (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  item TEXT NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL,
  buyer_id TEXT,
  created_at INTEGER NOT NULL,
  sold_at INTEGER
);
CREATE TABLE IF NOT EXISTS duels (
  id TEXT PRIMARY KEY,
  challenger TEXT NOT NULL,
  opponent TEXT NOT NULL,
  status TEXT NOT NULL,
  state TEXT NOT NULL,
  winner TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  from_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_channel ON messages (channel, id);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
`;

export class Db {
  readonly raw: DatabaseSync;

  constructor(file: string) {
    const target = resolve(file);
    if (target !== ":memory:") mkdirSync(dirname(target), { recursive: true });
    this.raw = new DatabaseSync(target === ":memory:" ? ":memory:" : target);
    this.raw.exec("PRAGMA journal_mode = WAL;");
    this.raw.exec("PRAGMA foreign_keys = ON;");
    this.raw.exec(SCHEMA);
  }

  close(): void {
    this.raw.close();
  }

  one<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.raw.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  all<T>(sql: string, ...params: unknown[]): T[] {
    return this.raw.prepare(sql).all(...(params as never[])) as T[];
  }

  run(sql: string, ...params: unknown[]): void {
    this.raw.prepare(sql).run(...(params as never[]));
  }

  transaction<T>(fn: () => T): T {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.raw.exec("COMMIT");
      return out;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }
}

/** Профиль игрока вместе с сохранением. */
export interface StoredProfile {
  userId: string;
  login: string;
  player: Player;
  bestFloor: number;
  unlockedFloor: number;
  updatedAt: number;
}

export function readProfile(db: Db, userId: string): StoredProfile | null {
  const row = db.one<ProfileRow & { login: string }>(
    "SELECT p.*, u.login AS login FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?",
    userId,
  );
  if (!row) return null;
  try {
    const save = JSON.parse(row.save) as { player: Player; unlockedFloor?: number };
    return {
      userId: row.user_id,
      login: row.login,
      player: save.player,
      bestFloor: row.best_floor,
      unlockedFloor: Math.max(1, save.unlockedFloor ?? row.best_floor ?? 1),
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export function writeProfile(
  db: Db,
  profile: { userId: string; player: Player; bestFloor: number; unlockedFloor: number },
): void {
  db.run(
    `INSERT INTO profiles (user_id, name, level, best_floor, gold, save, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       name = excluded.name, level = excluded.level, best_floor = excluded.best_floor,
       gold = excluded.gold, save = excluded.save, updated_at = excluded.updated_at`,
    profile.userId,
    profile.player.name,
    profile.player.level,
    profile.bestFloor,
    profile.player.gold,
    JSON.stringify({ player: profile.player, unlockedFloor: profile.unlockedFloor }),
    Date.now(),
  );
}
