const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

/**
 * Интеграционные проверки общего сервера: настоящая SQLite-база во временной папке,
 * собранный сервер и HTTP-запросы так, как их делает клиент.
 */
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-server-"));
const PORT = 8900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
let server;

async function api(method, route, token, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : {} };
}

async function account(login) {
  const reg = await api("POST", "/auth/register", null, { login, password: "secret123" });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  return { token: reg.data.token, id: reg.data.profile.id };
}

async function savePlayer(token, mutate) {
  const me = await api("GET", "/me", token);
  const player = me.data.profile.player;
  mutate(player);
  const res = await api("PUT", "/me", token, {
    player,
    unlockedFloor: me.data.profile.unlockedFloor,
    bestFloor: 3,
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

const gear = (uid) => ({
  uid,
  baseId: "sword",
  level: 1,
  wear: "worn",
  rarity: "common",
  identified: true,
  statRolls: { hp: 10, armor: 0 },
});

before(async () => {
  execFileSync(process.execPath, ["scripts/build-server.mjs"], { stdio: "ignore" });
  server = spawn(process.execPath, ["server/.build/server.mjs"], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: path.join(temp, "test.db") },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* сервер ещё поднимается */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("сервер не поднялся");
});

after(() => {
  server?.kill("SIGKILL");
  fs.rmSync(temp, { recursive: true, force: true });
});

test("server: login, password hashing and profile persistence", async () => {
  const alice = await account("alice_api");
  const bad = await api("POST", "/auth/login", null, { login: "alice_api", password: "wrong-pass" });
  assert.equal(bad.status, 401);
  const again = await api("POST", "/auth/login", null, { login: "alice_api", password: "secret123" });
  assert.equal(again.status, 200);
  assert.equal(again.data.profile.id, alice.id);

  await savePlayer(alice.token, (p) => {
    p.gold = 777;
    p.armory = [gear("a1"), gear("a2")];
  });
  const me = await api("GET", "/me", alice.token);
  assert.equal(me.data.profile.gold, 777);
  assert.equal(me.data.profile.player.armory.length, 2);
  assert.equal(me.data.profile.bestFloor, 3);

  const noAuth = await api("GET", "/me", null);
  assert.equal(noAuth.status, 401);
});

test("server: players list, friends and private chat only for friends", async () => {
  const a = await account("friend_a");
  const b = await account("friend_b");
  const list = await api("GET", "/players", a.token);
  assert.ok(list.data.players.some((p) => p.id === b.id));

  const blocked = await api("POST", `/chat/dm/${b.id}`, a.token, { body: "привет" });
  assert.equal(blocked.status, 403);

  const added = await api("POST", "/friends", a.token, { id: b.id });
  assert.equal(added.status, 200);
  const friends = await api("GET", "/friends", b.token);
  assert.ok(friends.data.friends.some((p) => p.id === a.id), "дружба двусторонняя");

  const sent = await api("POST", `/chat/dm/${b.id}`, a.token, { body: "привет" });
  assert.equal(sent.status, 200);
  const chat = await api("GET", `/chat/dm/${a.id}`, b.token);
  assert.equal(chat.data.messages.at(-1).body, "привет");

  const removed = await api("DELETE", `/friends/${b.id}`, a.token);
  assert.equal(removed.status, 200);
  const after = await api("POST", `/chat/dm/${b.id}`, a.token, { body: "ещё раз" });
  assert.equal(after.status, 403);
});

test("server: market escrow, purchase and gold transfer", async () => {
  const seller = await account("market_seller");
  const buyer = await account("market_buyer");
  await savePlayer(seller.token, (p) => {
    p.armory = [gear("m1")];
    p.gold = 100;
  });
  await savePlayer(buyer.token, (p) => {
    p.armory = [];
    p.gold = 500;
  });

  const listed = await api("POST", "/market", seller.token, { itemUid: "m1", price: 150 });
  assert.equal(listed.status, 200, JSON.stringify(listed.data));
  const sellerMe = await api("GET", "/me", seller.token);
  assert.equal(sellerMe.data.profile.player.armory.length, 0, "предмет ушёл в эскроу");

  const market = await api("GET", "/market", buyer.token);
  const lot = market.data.listings.find((l) => l.sellerName === "market_seller");
  assert.ok(lot);
  const bought = await api("POST", `/market/${lot.id}`, buyer.token);
  assert.equal(bought.status, 200);

  const buyerMe = await api("GET", "/me", buyer.token);
  const sellerAfter = await api("GET", "/me", seller.token);
  assert.equal(buyerMe.data.profile.gold, 350);
  assert.equal(sellerAfter.data.profile.gold, 250);
  assert.ok(buyerMe.data.profile.player.armory.some((g) => g.uid === "m1"));
  assert.equal((await api("POST", `/market/${lot.id}`, buyer.token)).data.error, "Лот уже не продаётся");
});

test("server: trade offer, counter offer and swap", async () => {
  const a = await account("trade_a");
  const b = await account("trade_b");
  await savePlayer(a.token, (p) => (p.armory = [gear("ta")]));
  await savePlayer(b.token, (p) => (p.armory = [gear("tb")]));

  const offered = await api("POST", "/trades", a.token, { to: b.id, itemUids: ["ta"], message: "меняю меч" });
  assert.equal(offered.status, 200, JSON.stringify(offered.data));

  const tradesB = await api("GET", "/trades", b.token);
  const incoming = tradesB.data.trades[0];
  assert.equal(incoming.status, "offered");
  assert.equal(incoming.offer[0].uid, "ta");

  const countered = await api("POST", `/trades/${incoming.id}/counter`, b.token, { itemUids: ["tb"], message: "только так" });
  assert.equal(countered.status, 200, JSON.stringify(countered.data));

  const tradesA = await api("GET", "/trades", a.token);
  const answered = tradesA.data.trades[0];
  assert.equal(answered.status, "countered");
  assert.equal(answered.request[0].uid, "tb");

  const accepted = await api("POST", `/trades/${answered.id}/accept`, a.token);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));

  const aMe = await api("GET", "/me", a.token);
  const bMe = await api("GET", "/me", b.token);
  assert.ok(aMe.data.profile.player.armory.some((g) => g.uid === "tb"));
  assert.ok(bMe.data.profile.player.armory.some((g) => g.uid === "ta"));
});

test("server: duel challenge, 20 second turn and actions", async () => {
  const a = await account("duel_a");
  const b = await account("duel_b");
  const created = await api("POST", "/duels", a.token, { opponent: b.id });
  assert.equal(created.status, 200, JSON.stringify(created.data));

  const bList = await api("GET", "/duels", b.token);
  const pending = bList.data.duels.find((d) => d.status === "pending");
  assert.ok(pending);

  const accepted = await api("POST", `/duels/${pending.id}/accept`, b.token);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));

  const view = await api("GET", `/duels/${pending.id}`, a.token);
  assert.equal(view.data.duel.status, "active");
  const state = view.data.duel.state;
  assert.equal(state.turn, "a");
  assert.ok(state.deadline - Date.now() > 15_000, "на ход около 20 секунд");

  const enemy = await api("POST", `/duels/${pending.id}/action`, b.token, { action: { type: "attack" } });
  assert.equal(enemy.status, 409, "нельзя ходить не в свой ход");

  const hit = await api("POST", `/duels/${pending.id}/action`, a.token, { action: { type: "attack" } });
  assert.equal(hit.status, 200);
  assert.ok(hit.data.duel.state.log.length >= 2);

  const guard = await api("POST", `/duels/${pending.id}/action`, b.token, { action: { type: "guard" } });
  assert.equal(guard.status, 200);
  assert.match(guard.data.duel.state.log.join(" "), /закрывается/);
  assert.equal(guard.data.duel.state.turn, "a", "ход вернулся к первому игроку");
});

test("server: global chat is public and ordered", async () => {
  const a = await account("chat_a");
  await api("POST", "/chat/global", a.token, { body: "первое" });
  await api("POST", "/chat/global", a.token, { body: "второе" });
  const res = await api("GET", "/chat/global?after=0", a.token);
  const bodies = res.data.messages.map((m) => m.body);
  assert.deepEqual(bodies.slice(-2), ["первое", "второе"]);
  assert.equal((await api("POST", "/chat/global", a.token, { body: "" })).status, 400);
});
