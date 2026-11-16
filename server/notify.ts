import type { Db } from "./db";
import { publish } from "./events";

export type NotificationKind = "dm" | "friend_request" | "friend_accepted" | "trade" | "duel" | "market_sale";

export interface NotificationView {
  id: number;
  kind: NotificationKind;
  refId: string | null;
  body: string;
  createdAt: number;
  readAt: number | null;
}

export function unreadCount(db: Db, userId: string): number {
  const row = db.one<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId);
  return Number(row?.n ?? 0);
}

/** Непрочитанное по типам: вкладки сообщества показывают свой бейдж. */
export function unreadByKind(db: Db, userId: string): Record<string, number> {
  const rows = db.all<{ kind: string; n: number }>(
    "SELECT kind, COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL GROUP BY kind",
    userId,
  );
  return Object.fromEntries(rows.map((row) => [row.kind, Number(row.n)]));
}

/**
 * Уведомление игроку. Для личных сообщений от одного и того же игрока
 * не плодим дубли, пока предыдущее не прочитано.
 */
export function notify(db: Db, userId: string, kind: NotificationKind, refId: string | null, body: string): void {
  if (kind === "dm" && refId) {
    const existing = db.one<{ id: number }>(
      "SELECT id FROM notifications WHERE user_id = ? AND kind = 'dm' AND ref_id = ? AND read_at IS NULL LIMIT 1",
      userId,
      refId,
    );
    if (existing) {
      publish([userId], "notification", { unread: unreadCount(db, userId), byKind: unreadByKind(db, userId) });
      return;
    }
  }
  db.run(
    "INSERT INTO notifications (user_id, kind, ref_id, body, created_at, read_at) VALUES (?, ?, ?, ?, ?, NULL)",
    userId,
    kind,
    refId,
    body.slice(0, 200),
    Date.now(),
  );
  publish([userId], "notification", { unread: unreadCount(db, userId), byKind: unreadByKind(db, userId) });
}

export function listNotifications(
  db: Db,
  userId: string,
  since = 0,
): { unread: number; byKind: Record<string, number>; items: NotificationView[] } {
  const rows = db.all<Record<string, unknown>>(
    "SELECT * FROM notifications WHERE user_id = ? AND id > ? ORDER BY id DESC LIMIT 50",
    userId,
    since,
  );
  return {
    unread: unreadCount(db, userId),
    byKind: unreadByKind(db, userId),
    items: rows.map((row) => ({
      id: Number(row.id),
      kind: String(row.kind) as NotificationKind,
      refId: row.ref_id === null ? null : String(row.ref_id),
      body: String(row.body),
      createdAt: Number(row.created_at),
      readAt: row.read_at === null ? null : Number(row.read_at),
    })),
  };
}

/**
 * Отмечает прочитанными: все, либо до id upTo, либо только типы kinds (когда игрок открыл раздел).
 */
export function markRead(db: Db, userId: string, opts: { upTo?: number; kinds?: string[] } = {}): void {
  const now = Date.now();
  const kinds = opts.kinds?.filter((k) => /^[a-z_]{1,32}$/.test(k)) ?? [];
  if (opts.kinds && kinds.length === 0) return;
  const clauses = ["user_id = ?", "read_at IS NULL"];
  const params: unknown[] = [userId];
  if (opts.upTo !== undefined) {
    clauses.push("id <= ?");
    params.push(opts.upTo);
  }
  if (kinds.length) {
    clauses.push(`kind IN (${kinds.map(() => "?").join(", ")})`);
    params.push(...kinds);
  }
  db.run(`UPDATE notifications SET read_at = ? WHERE ${clauses.join(" AND ")}`, now, ...params);
  publish([userId], "notification", { unread: unreadCount(db, userId), byKind: unreadByKind(db, userId) });
}
