import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Player, Run } from "../src/game/types";

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
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests (to_id, status);
CREATE INDEX IF NOT EXISTS friend_requests_from ON friend_requests (from_id, status);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, id);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS portraits (
  user_id TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
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
  /** Карта похода, если игрок вышел на карте; null — герой в лобби. */
  run: Run | null;
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
    const save = JSON.parse(row.save) as { player: Player; unlockedFloor?: number; run?: Run | null };
    return {
      userId: row.user_id,
      login: row.login,
      player: save.player,
      run: save.run ?? null,
      bestFloor: row.best_floor,
      unlockedFloor: Math.max(1, save.unlockedFloor ?? row.best_floor ?? 1),
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * Запись профиля. Без поля `run` карта похода сохраняется прежней: так пишут рынок, обмены и дуэли,
 * которые меняют только героя и не должны стирать карту игрока.
 */
export function writeProfile(
  db: Db,
  profile: { userId: string; player: Player; bestFloor: number; unlockedFloor: number; run?: Run | null },
): void {
  const run = profile.run !== undefined ? profile.run : readProfile(db, profile.userId)?.run ?? null;
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
    JSON.stringify({ player: profile.player, unlockedFloor: profile.unlockedFloor, run }),
    Date.now(),
  );
}
