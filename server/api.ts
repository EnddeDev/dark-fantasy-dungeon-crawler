import { randomUUID } from "node:crypto";
import type { Db, StoredProfile } from "./db";
import { readProfile, writeProfile } from "./db";
import { isOnline, createSession, hashPassword, sessionUser, validateCredentials, verifyPassword, type UserRow } from "./auth";
import { HttpError, field, num, text, type Ctx } from "./http";
import type { GearItem, Player } from "../src/game/types";
import { GEAR_BASES } from "../src/game/content";
import { PlayerFactory } from "../src/model/PlayerFactory";
import { createDuel, duelAction, duelActionError, duelTimeout, DUEL_TURN_MS, type DuelAction, type DuelState } from "../src/game/duel";
import { sanitizePlayer } from "./save";

type Row = Record<string, unknown>;

const ONLINE_MS = 60_000;
const MAX_MESSAGE = 400;
const MARKET_MAX_ITEMS_PER_PLAYER = 10;
const TRADE_MAX_ITEMS = 6;

function requireUser(db: Db, ctx: Ctx): UserRow {
  const user = sessionUser(db, ctx.token);
  if (!user) throw new HttpError(401, "Нужен вход в аккаунт");
  return user;
}

function profileOf(db: Db, userId: string): StoredProfile {
  const profile = readProfile(db, userId);
  if (!profile) throw new HttpError(404, "Профиль не найден");
  return profile;
}

function savePlayer(db: Db, profile: StoredProfile, player: Player): StoredProfile {
  writeProfile(db, {
    userId: profile.userId,
    player,
    bestFloor: profile.bestFloor,
    unlockedFloor: profile.unlockedFloor,
  });
  return { ...profile, player };
}

function itemName(item: GearItem): string {
  return GEAR_BASES[item.baseId]?.name ?? item.baseId;
}

function equippedUids(player: Player): Set<string> {
  return new Set(Object.values(player.equip ?? {}).filter((uid): uid is string => typeof uid === "string"));
}

/** Забираем предмет из арморы в «эскроу» сделки: надетые вещи трогать нельзя. */
function escrowItem(player: Player, uid: string): { player: Player; item: GearItem } {
  const item = (player.armory ?? []).find((g) => g.uid === uid);
  if (!item) throw new HttpError(400, "Предмета нет в арсенале");
  if (equippedUids(player).has(uid)) throw new HttpError(400, `Снимите «${itemName(item)}» перед сделкой`);
  return { player: { ...player, armory: player.armory.filter((g) => g.uid !== uid) }, item };
}

function giveItem(player: Player, item: GearItem): Player {
  if (player.armory.some((g) => g.uid === item.uid)) return player;
  return { ...player, armory: [item, ...player.armory] };
}

function publicProfile(profile: StoredProfile, db: Db, now = Date.now()) {
  return {
    id: profile.userId,
    login: profile.login,
    name: profile.player.name,
    level: profile.player.level,
    gold: profile.player.gold,
    bestFloor: profile.bestFloor,
    unlockedFloor: profile.unlockedFloor,
    online: isOnline(db, profile.userId, now),
    kills: profile.player.kills,
  };
}

function playerSummary(db: Db, userId: string, viewerId: string, now = Date.now()) {
  const profile = readProfile(db, userId);
  if (!profile) return null;
  const friend = !!db.one<Row>("SELECT 1 AS x FROM friends WHERE user_id = ? AND friend_id = ?", viewerId, userId);
  return {
    id: profile.userId,
    login: profile.login,
    name: profile.player.name,
    level: profile.player.level,
    bestFloor: profile.bestFloor,
    online: isOnline(db, profile.userId, now),
    friend,
    kills: profile.player.kills,
  };
}

function dmChannel(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

function areFriends(db: Db, a: string, b: string): boolean {
  return !!db.one<Row>("SELECT 1 AS x FROM friends WHERE user_id = ? AND friend_id = ?", a, b);
}

function messageRow(row: Row) {
  return {
    id: Number(row.id),
    fromId: String(row.from_id),
    fromName: String(row.from_name ?? ""),
    body: String(row.body),
    createdAt: Number(row.created_at),
    channel: String(row.channel),
  };
}

/* ─────────────────────────── авторизация и профиль ─────────────────────────── */

function register(ctx: Ctx, db: Db) {
  const login = text(ctx.body, "login", 20);
  const password = text(ctx.body, "password", 128);
  validateCredentials(login, password);
  const existing = db.one<Row>("SELECT id FROM users WHERE lower(login) = lower(?)", login);
  if (existing) throw new HttpError(409, "Такой логин уже занят");
  const id = randomUUID();
  db.run("INSERT INTO users (id, login, pass, created_at) VALUES (?, ?, ?, ?)", id, login, hashPassword(password), Date.now());
  const player: Player = { ...PlayerFactory.createInitial(), name: login.slice(0, 16) };
  writeProfile(db, { userId: id, player, bestFloor: 1, unlockedFloor: 1 });
  const token = createSession(db, id);
  return { token, profile: publicProfile(profileOf(db, id), db) };
}

function loginUser(ctx: Ctx, db: Db) {
  const login = text(ctx.body, "login", 20);
  const password = text(ctx.body, "password", 128);
  if (!login || !password) throw new HttpError(400, "Введите логин и пароль");
  const user = db.one<UserRow>("SELECT * FROM users WHERE lower(login) = lower(?)", login);
  if (!user || !verifyPassword(password, user.pass)) throw new HttpError(401, "Неверный логин или пароль");
  const token = createSession(db, user.id);
  return { token, profile: publicProfile(profileOf(db, user.id), db) };
}

function saveProfile(ctx: Ctx, db: Db) {
  const user = requireUser(db, ctx);
  const profile = profileOf(db, user.id);
  const unlockedFloor = Math.max(1, Math.min(99, Math.round(num(ctx.body, "unlockedFloor") || profile.unlockedFloor)));
  const bestFloor = Math.max(profile.bestFloor, Math.round(num(ctx.body, "bestFloor") || 0), unlockedFloor - 1);
  /* Клиент присылает героя целиком, поэтому сохранение проверяется и
     приводится к допустимому виду на сервере: неизвестные предметы, чужие
     uid в слотах и характеристики сверх очков уровня отклоняются. */
  const player = sanitizePlayer(field<Player>(ctx.body, "player"), unlockedFloor);
  writeProfile(db, { userId: user.id, player, bestFloor, unlockedFloor });
  return { profile: publicProfile(profileOf(db, user.id), db) };
}

function me(ctx: Ctx, db: Db) {
  const user = requireUser(db, ctx);
  const profile = profileOf(db, user.id);
  return { profile: { ...publicProfile(profile, db), player: profile.player } };
}

/* ─────────────────────────── игроки, друзья, чат ─────────────────────────── */

function playerList(ctx: Ctx, db: Db) {
  const user = requireUser(db, ctx);
  const search = (ctx.url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 32);
  const now = Date.now();
  const rows = db.all<Row>(
    `SELECT p.user_id, p.name, p.level, p.best_floor, u.login
     FROM profiles p JOIN users u ON u.id = p.user_id
     WHERE p.user_id <> ?`,
    user.id,
  );
  const players = rows
    .map((row) => playerSummary(db, String(row.user_id), user.id, now))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .filter((p) => !search || p.name.toLowerCase().includes(search) || p.login.toLowerCase().includes(search))
    .sort((a, b) => b.bestFloor - a.bestFloor || a.name.localeCompare(b.name));
  return { players };
}

function friendList(ctx: Ctx, db: Db) {
  const user = requireUser(db, ctx);
  const rows = db.all<Row>("SELECT friend_id FROM friends WHERE user_id = ?", user.id);
  const now = Date.now();
  const friends = rows
    .map((row) => playerSummary(db, String(row.friend_id), user.id, now))
    .filter((p): p is NonNullable<typeof p> => !!p);
  return { friends };
}

function addFriend(ctx: Ctx, db: Db) {
  const user = requireUser(db, ctx);
  const target = text(ctx.body, "id", 64);
  if (!target || target === user.id) throw new HttpError(400, "Нельзя добавить себя");
  if (!readProfile(db, target)) throw new HttpError(404, "Игрок не найден");
  const now = Date.now();
  db.run("INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)", user.id, target, now);
  db.run("INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)", target, user.id, now);
  return { friend: playerSummary(db, target, user.id) };
}

function removeFriend(ctx: Ctx, db: Db) {
  const user = requireUser(db, ctx);
  const target = ctx.params.id;
  db.run("DELETE FROM friends WHERE user_id = ? AND friend_id = ?", user.id, target);
  db.run("DELETE FROM friends WHERE user_id = ? AND friend_id = ?", target, user.id);
  return { ok: true };
}

function chatRead(ctx: Ctx, db: Db, channel: string) {
  requireUser(db, ctx);
  const after = Number(ctx.url.searchParams.get("after") ?? 0) || 0;
  const rows = db.all<Row>(
    `SELECT m.*, p.name AS from_name FROM messages m
     LEFT JOIN profiles p ON p.user_id = m.from_id
     WHERE m.channel = ? AND m.id > ? ORDER BY m.id ASC LIMIT 200`,
    channel,
    after,
  );
  return { messages: rows.map(messageRow) };
}

function chatPost(ctx: Ctx, db: Db, channel: string) {
  const user = requireUser(db, ctx);
  const body = text(ctx.body, "body", MAX_MESSAGE);
  if (!body) throw new HttpError(400, "Пустое сообщение");
  db.run("INSERT INTO messages (channel, from_id, body, created_at) VALUES (?, ?, ?, ?)", channel, user.id, body, Date.now());
  return { ok: true };
}

export function handleAuth(ctx: Ctx, db: Db, action: string) {
  if (action === "register") return register(ctx, db);
  if (action === "login") return loginUser(ctx, db);
  if (action === "logout") {
    if (ctx.token) db.run("DELETE FROM sessions WHERE token = ?", ctx.token);
    return { ok: true };
  }
  throw new HttpError(404, "Неизвестное действие");
}

export function handleMe(ctx: Ctx, db: Db, method: string) {
  if (method === "GET") return me(ctx, db);
  if (method === "PUT") return saveProfile(ctx, db);
  throw new HttpError(405, "Метод не поддерживается");
}

export function handlePlayers(ctx: Ctx, db: Db) {
  return playerList(ctx, db);
}

export function handleFriends(ctx: Ctx, db: Db, method: string) {
  if (method === "GET") return friendList(ctx, db);
  if (method === "POST") return addFriend(ctx, db);
  if (method === "DELETE") return removeFriend(ctx, db);
  throw new HttpError(405, "Метод не поддерживается");
}

export function handleChat(ctx: Ctx, db: Db, method: string, scope: string, peer: string | null) {
  if (scope === "global") {
    return method === "GET" ? chatRead(ctx, db, "global") : chatPost(ctx, db, "global");
  }
  const user = requireUser(db, ctx);
  if (!peer || !readProfile(db, peer)) throw new HttpError(404, "Игрок не найден");
  if (!areFriends(db, user.id, peer)) throw new HttpError(403, "Личные сообщения доступны только друзьям");
  return method === "GET" ? chatRead(ctx, db, dmChannel(user.id, peer)) : chatPost(ctx, db, dmChannel(user.id, peer));
}

export { requireUser, profileOf, savePlayer, escrowItem, giveItem, itemName, publicProfile, playerSummary, areFriends, dmChannel, messageRow, equippedUids, ONLINE_MS, MARKET_MAX_ITEMS_PER_PLAYER, TRADE_MAX_ITEMS, GEAR_BASES, randomUUID, readProfile, writeProfile, DUEL_TURN_MS, createDuel, duelAction, duelActionError, duelTimeout };
export type { DuelAction, DuelState, Row };

/* ─────────────────────────── рынок ─────────────────────────── */

function listingView(row: Row, viewerId: string) {
  const item = JSON.parse(String(row.item)) as GearItem;
  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    sellerName: String(row.seller_name ?? ""),
    item,
    itemName: itemName(item),
    price: Number(row.price),
    createdAt: Number(row.created_at),
    mine: String(row.seller_id) === viewerId,
  };
}

export function handleMarket(ctx: Ctx, db: Db, method: string, id: string | null) {
  const user = requireUser(db, ctx);
  if (method === "GET") {
    const rows = db.all<Row>(
      `SELECT m.*, p.name AS seller_name FROM market m LEFT JOIN profiles p ON p.user_id = m.seller_id
       WHERE m.status = 'active' ORDER BY m.created_at DESC LIMIT 200`,
    );
    return { listings: rows.map((row) => listingView(row, user.id)) };
  }

  if (method === "POST" && !id) {
    const profile = profileOf(db, user.id);
    const uid = text(ctx.body, "itemUid", 64);
    const price = Math.round(num(ctx.body, "price"));
    if (!uid) throw new HttpError(400, "Выберите предмет");
    if (!Number.isFinite(price) || price < 1 || price > 1_000_000) throw new HttpError(400, "Цена от 1 до 1 000 000 золотых");
    const active = db.one<Row>("SELECT COUNT(*) AS n FROM market WHERE seller_id = ? AND status = 'active'", user.id);
    if (Number(active?.n ?? 0) >= MARKET_MAX_ITEMS_PER_PLAYER) {
      throw new HttpError(400, `На рынке можно держать не больше ${MARKET_MAX_ITEMS_PER_PLAYER} лотов`);
    }
    const { player, item } = escrowItem(profile.player, uid);
    db.transaction(() => {
      savePlayer(db, profile, player);
      db.run(
        "INSERT INTO market (id, seller_id, item, price, status, buyer_id, created_at, sold_at) VALUES (?, ?, ?, ?, 'active', NULL, ?, NULL)",
        randomUUID(),
        user.id,
        JSON.stringify(item),
        price,
        Date.now(),
      );
    });
    return { ok: true };
  }

  if (method === "POST" && id) {
    const row = db.one<Row>("SELECT * FROM market WHERE id = ?", id);
    if (!row) throw new HttpError(404, "Лот не найден");
    if (String(row.status) !== "active") throw new HttpError(409, "Лот уже не продаётся");
    const sellerId = String(row.seller_id);
    if (sellerId === user.id) throw new HttpError(400, "Нельзя купить свой лот");
    const price = Number(row.price);
    const buyer = profileOf(db, user.id);
    if (buyer.player.gold < price) throw new HttpError(400, "Недостаточно золота");
    const seller = readProfile(db, sellerId);
    if (!seller) throw new HttpError(404, "Продавец не найден");
    const item = JSON.parse(String(row.item)) as GearItem;
    db.transaction(() => {
      db.run("UPDATE market SET status = 'sold', buyer_id = ?, sold_at = ? WHERE id = ? AND status = 'active'", user.id, Date.now(), id);
      savePlayer(db, buyer, { ...giveItem(buyer.player, item), gold: buyer.player.gold - price });
      savePlayer(db, seller, { ...seller.player, gold: seller.player.gold + price });
    });
    return { ok: true, item };
  }

  if (method === "DELETE" && id) {
    const row = db.one<Row>("SELECT * FROM market WHERE id = ?", id);
    if (!row) throw new HttpError(404, "Лот не найден");
    if (String(row.seller_id) !== user.id) throw new HttpError(403, "Это не ваш лот");
    if (String(row.status) !== "active") throw new HttpError(409, "Лот уже закрыт");
    const profile = profileOf(db, user.id);
    const item = JSON.parse(String(row.item)) as GearItem;
    db.transaction(() => {
      db.run("UPDATE market SET status = 'cancelled', sold_at = ? WHERE id = ?", Date.now(), id);
      savePlayer(db, profile, giveItem(profile.player, item));
    });
    return { ok: true };
  }

  throw new HttpError(405, "Метод не поддерживается");
}

/* ─────────────────────────── обмен снаряжением ─────────────────────────── */

function tradeView(db: Db, row: Row) {
  const fromId = String(row.from_id);
  const toId = String(row.to_id);
  const name = (userId: string) => readProfile(db, userId)?.player.name ?? "неизвестный";
  return {
    id: String(row.id),
    fromId,
    fromName: name(fromId),
    toId,
    toName: name(toId),
    status: String(row.status),
    offer: JSON.parse(String(row.offer)) as GearItem[],
    request: JSON.parse(String(row.request)) as GearItem[],
    message: String(row.message ?? ""),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function returnEscrow(db: Db, userId: string, items: GearItem[]): void {
  if (!items.length) return;
  const profile = readProfile(db, userId);
  if (!profile) return;
  const player = items.reduce((acc, item) => giveItem(acc, item), profile.player);
  savePlayer(db, profile, player);
}

function takeEscrow(profile: StoredProfile, uids: string[]): { player: Player; items: GearItem[] } {
  let player = profile.player;
  const items: GearItem[] = [];
  for (const uid of [...new Set(uids)]) {
    const res = escrowItem(player, uid);
    player = res.player;
    items.push(res.item);
  }
  if (!items.length) throw new HttpError(400, "Выберите хотя бы один предмет");
  if (items.length > TRADE_MAX_ITEMS) throw new HttpError(400, `Не больше ${TRADE_MAX_ITEMS} предметов за обмен`);
  return { player, items };
}

export function handleTrades(ctx: Ctx, db: Db, method: string, id: string | null, action: string | null) {
  const user = requireUser(db, ctx);

  if (method === "GET") {
    const rows = db.all<Row>(
      "SELECT * FROM trades WHERE from_id = ? OR to_id = ? ORDER BY updated_at DESC LIMIT 100",
      user.id,
      user.id,
    );
    return { trades: rows.map((row) => tradeView(db, row)) };
  }

  if (method === "POST" && !id) {
    const to = text(ctx.body, "to", 64);
    if (!to || to === user.id) throw new HttpError(400, "Выберите другого игрока");
    if (!readProfile(db, to)) throw new HttpError(404, "Игрок не найден");
    const uids = Array.isArray(field<unknown>(ctx.body, "itemUids")) ? (field<string[]>(ctx.body, "itemUids") as string[]) : [];
    const profile = profileOf(db, user.id);
    const { player, items } = takeEscrow(profile, uids);
    const now = Date.now();
    db.transaction(() => {
      savePlayer(db, profile, player);
      db.run(
        "INSERT INTO trades (id, from_id, to_id, status, offer, request, message, created_at, updated_at) VALUES (?, ?, ?, 'offered', ?, '[]', ?, ?, ?)",
        randomUUID(),
        user.id,
        to,
        JSON.stringify(items),
        text(ctx.body, "message", 200),
        now,
        now,
      );
    });
    return { ok: true };
  }

  const row = db.one<Row>("SELECT * FROM trades WHERE id = ?", id ?? "");
  if (!row) throw new HttpError(404, "Обмен не найден");
  const fromId = String(row.from_id);
  const toId = String(row.to_id);
  const status = String(row.status);
  if (user.id !== fromId && user.id !== toId) throw new HttpError(403, "Это не ваш обмен");
  const offer = JSON.parse(String(row.offer)) as GearItem[];
  const request = JSON.parse(String(row.request)) as GearItem[];

  const close = (nextStatus: string) => {
    db.run("UPDATE trades SET status = ?, updated_at = ? WHERE id = ?", nextStatus, Date.now(), id);
  };

  if (method === "POST" && action === "decline") {
    if (status !== "offered" && status !== "countered") throw new HttpError(409, "Обмен уже закрыт");
    returnEscrow(db, fromId, offer);
    returnEscrow(db, toId, request);
    close("declined");
    return { ok: true };
  }

  if (method === "POST" && action === "cancel") {
    if (user.id !== fromId) throw new HttpError(403, "Отменить может только автор предложения");
    if (status !== "offered" && status !== "countered") throw new HttpError(409, "Обмен уже закрыт");
    returnEscrow(db, fromId, offer);
    returnEscrow(db, toId, request);
    close("cancelled");
    return { ok: true };
  }

  if (method === "POST" && action === "counter") {
    if (user.id !== toId) throw new HttpError(403, "Встречное предложение делает получатель");
    if (status !== "offered") throw new HttpError(409, "Ответить можно только на первое предложение");
    const profile = profileOf(db, user.id);
    const uids = Array.isArray(field<unknown>(ctx.body, "itemUids")) ? (field<string[]>(ctx.body, "itemUids") as string[]) : [];
    const { player, items } = takeEscrow(profile, uids);
    db.transaction(() => {
      savePlayer(db, profile, player);
      db.run(
        "UPDATE trades SET status = 'countered', request = ?, message = ?, updated_at = ? WHERE id = ?",
        JSON.stringify(items),
        text(ctx.body, "message", 200) || String(row.message ?? ""),
        Date.now(),
        id,
      );
    });
    return { ok: true };
  }

  if (method === "POST" && action === "accept") {
    if (status === "offered") {
      if (user.id !== toId) throw new HttpError(403, "Принять может получатель предложения");
    } else if (status === "countered") {
      if (user.id !== fromId) throw new HttpError(403, "Встречное предложение принимает автор первого предложения");
    } else {
      throw new HttpError(409, "Обмен уже закрыт");
    }
    const fromProfile = profileOf(db, fromId);
    const toProfile = profileOf(db, toId);
    db.transaction(() => {
      let fromPlayer = fromProfile.player;
      let toPlayer = toProfile.player;
      for (const item of offer) toPlayer = giveItem(toPlayer, item);
      for (const item of request) fromPlayer = giveItem(fromPlayer, item);
      savePlayer(db, fromProfile, fromPlayer);
      savePlayer(db, toProfile, toPlayer);
      db.run("UPDATE trades SET status = 'accepted', updated_at = ? WHERE id = ?", Date.now(), id);
    });
    return { ok: true };
  }

  throw new HttpError(404, "Неизвестное действие с обменом");
}

/* ─────────────────────────── дуэли ─────────────────────────── */

function duelRowView(row: Row, viewerId: string) {
  const state = JSON.parse(String(row.state)) as DuelState;
  const challenger = String(row.challenger);
  const side = challenger === viewerId ? "a" : "b";
  return {
    id: String(row.id),
    challengerId: challenger,
    challengerName: state.a.name,
    opponentId: String(row.opponent),
    opponentName: state.b.name,
    status: String(row.status),
    winner: row.winner ? String(row.winner) : state.winner ? (state.winner === "a" ? challenger : String(row.opponent)) : null,
    yourSide: side as "a" | "b",
    turn: state.turn === "a" ? challenger : String(row.opponent),
    round: state.round,
    deadline: state.deadline,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function settleDuel(db: Db, row: Row, state: DuelState): void {
  if (!state.winner || state.settled) return;
  const challenger = String(row.challenger);
  const opponent = String(row.opponent);
  const winnerId = state.winner === "a" ? challenger : opponent;
  const loserId = state.winner === "a" ? opponent : challenger;
  const winner = readProfile(db, winnerId);
  const loser = readProfile(db, loserId);
  if (winner && loser) {
    const loserHp = Math.max(1, Math.min(loser.player.hp, state[state.winner === "a" ? "b" : "a"].hp));
    savePlayer(db, winner, { ...winner.player, kills: winner.player.kills + 1 });
    savePlayer(db, loser, { ...loser.player, hp: loserHp });
  }
  state.settled = true;
  db.run("UPDATE duels SET winner = ?, updated_at = ? WHERE id = ?", winnerId, Date.now(), String(row.id));
}

function refreshDuel(db: Db, row: Row): { row: Row; state: DuelState } {
  const state = JSON.parse(String(row.state)) as DuelState;
  if (String(row.status) === "active" && !state.winner) {
    const timed = duelTimeout(state, Date.now());
    if (timed.seq !== state.seq) {
      settleDuel(db, row, timed);
      db.run(
        "UPDATE duels SET state = ?, status = ?, updated_at = ? WHERE id = ?",
        JSON.stringify(timed),
        timed.winner ? "finished" : "active",
        Date.now(),
        String(row.id),
      );
      return { row: { ...row, status: timed.winner ? "finished" : "active" }, state: timed };
    }
  }
  return { row, state };
}

export function handleDuels(ctx: Ctx, db: Db, method: string, id: string | null, action: string | null) {
  const user = requireUser(db, ctx);

  if (method === "GET" && !id) {
    const rows = db.all<Row>(
      "SELECT * FROM duels WHERE challenger = ? OR opponent = ? ORDER BY updated_at DESC LIMIT 50",
      user.id,
      user.id,
    );
    const duels = rows.map((row) => {
      const refreshed = refreshDuel(db, row);
      return duelRowView(refreshed.row, user.id);
    });
    return { duels };
  }

  if (method === "POST" && !id) {
    const opponent = text(ctx.body, "opponent", 64);
    if (!opponent || opponent === user.id) throw new HttpError(400, "Выберите другого игрока");
    if (!readProfile(db, opponent)) throw new HttpError(404, "Игрок не найден");
    const busy = db.one<Row>(
      "SELECT id FROM duels WHERE status IN ('pending', 'active') AND (challenger IN (?, ?) OR opponent IN (?, ?))",
      user.id,
      opponent,
      user.id,
      opponent,
    );
    if (busy) throw new HttpError(409, "У одного из игроков уже идёт дуэль или висит вызов");
    const me0 = profileOf(db, user.id);
    const rival = profileOf(db, opponent);
    const state = createDuel(randomUUID(), { userId: user.id, player: me0.player }, { userId: opponent, player: rival.player });
    state.deadline = 0;
    const now = Date.now();
    db.run(
      "INSERT INTO duels (id, challenger, opponent, status, state, winner, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, NULL, ?, ?)",
      state.id,
      user.id,
      opponent,
      JSON.stringify(state),
      now,
      now,
    );
    return { ok: true, id: state.id };
  }

  const row = db.one<Row>("SELECT * FROM duels WHERE id = ?", id ?? "");
  if (!row) throw new HttpError(404, "Дуэль не найдена");
  if (String(row.challenger) !== user.id && String(row.opponent) !== user.id) throw new HttpError(403, "Это не ваша дуэль");
  const side = String(row.challenger) === user.id ? "a" : "b";

  if (method === "GET") {
    const refreshed = refreshDuel(db, row);
    return { duel: { ...duelRowView(refreshed.row, user.id), state: refreshed.state } };
  }

  if (method === "POST" && action === "accept") {
    if (String(row.status) !== "pending") throw new HttpError(409, "Вызов уже неактуален");
    if (String(row.opponent) !== user.id) throw new HttpError(403, "Принять вызов может только соперник");
    const challenger = profileOf(db, String(row.challenger));
    const opponent = profileOf(db, user.id);
    const state = createDuel(randomUUID(), { userId: challenger.userId, player: challenger.player }, { userId: opponent.userId, player: opponent.player });
    db.run("UPDATE duels SET status = 'active', state = ?, updated_at = ? WHERE id = ?", JSON.stringify(state), Date.now(), String(row.id));
    return { ok: true };
  }

  if (method === "POST" && (action === "decline" || action === "cancel")) {
    if (String(row.status) !== "pending") throw new HttpError(409, "Вызов уже неактуален");
    if (action === "decline" && String(row.opponent) !== user.id) throw new HttpError(403, "Отклонить вызов может соперник");
    if (action === "cancel" && String(row.challenger) !== user.id) throw new HttpError(403, "Снять вызов может автор");
    db.run("UPDATE duels SET status = ?, updated_at = ? WHERE id = ?", action === "decline" ? "declined" : "cancelled", Date.now(), String(row.id));
    return { ok: true };
  }

  if (method === "POST" && action === "action") {
    const refreshed = refreshDuel(db, row);
    if (String(refreshed.row.status) !== "active") throw new HttpError(409, "Дуэль не идёт");
    const duelAction0 = field<DuelAction>(ctx.body, "action");
    if (!duelAction0 || typeof duelAction0.type !== "string") throw new HttpError(400, "Некорректное действие");
    const error = duelActionError(refreshed.state, side, duelAction0);
    if (error) throw new HttpError(409, error);
    const next = duelAction(refreshed.state, side, duelAction0, Date.now());
    settleDuel(db, refreshed.row, next);
    db.run(
      "UPDATE duels SET state = ?, status = ?, updated_at = ? WHERE id = ?",
      JSON.stringify(next),
      next.winner ? "finished" : "active",
      Date.now(),
      String(row.id),
    );
    return { duel: { ...duelRowView({ ...refreshed.row, status: next.winner ? "finished" : "active" }, user.id), state: next } };
  }

  throw new HttpError(404, "Неизвестное действие с дуэлью");
}
