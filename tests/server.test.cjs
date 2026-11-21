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

test("server: players list, friend requests and private chat only for friends", async () => {
  const a = await account("friend_a");
  const b = await account("friend_b");
  const list = await api("GET", "/players", a.token);
  assert.ok(list.data.players.some((p) => p.id === b.id));

  const blocked = await api("POST", `/chat/dm/${b.id}`, a.token, { body: "привет" });
  assert.equal(blocked.status, 403);

  const requested = await api("POST", "/friends", a.token, { id: b.id });
  assert.equal(requested.status, 200);
  assert.equal(requested.data.status, "requested");
  const notFriendYet = await api("GET", "/friends", b.token);
  assert.equal(notFriendYet.data.friends.some((p) => p.id === a.id), false, "до подтверждения дружбы нет");

  const incoming = await api("GET", "/friends/requests", b.token);
  assert.equal(incoming.data.incoming.length, 1);
  const requestId = incoming.data.incoming[0].requestId;
  assert.equal(incoming.data.incoming[0].player.id, a.id);

  const stillBlocked = await api("POST", `/chat/dm/${b.id}`, a.token, { body: "привет" });
  assert.equal(stillBlocked.status, 403, "заявка не даёт личных сообщений");

  const accepted = await api("POST", `/friends/requests/${requestId}/accept`, b.token);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
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

test("server: friend request can be declined, cancelled and crossed requests make friends", async () => {
  const a = await account("req_a");
  const b = await account("req_b");
  const c = await account("req_c");

  await api("POST", "/friends", a.token, { id: b.id });
  const bReq = (await api("GET", "/friends/requests", b.token)).data.incoming[0];
  const declined = await api("POST", `/friends/requests/${bReq.requestId}/decline`, b.token);
  assert.equal(declined.status, 200);
  assert.equal((await api("GET", "/friends/requests", b.token)).data.incoming.length, 0);

  await api("POST", "/friends", a.token, { id: c.id });
  const aOut = (await api("GET", "/friends/requests", a.token)).data.outgoing;
  assert.equal(aOut.length, 1, "отклонённая заявка не числится исходящей");
  assert.equal(aOut[0].player.id, c.id);
  const cancelled = await api("DELETE", `/friends/requests/${aOut.find((r) => r.player.id === c.id).requestId}`, a.token);
  assert.equal(cancelled.status, 200);
  assert.equal((await api("GET", "/friends/requests", c.token)).data.incoming.length, 0);

  await api("POST", "/friends", b.token, { id: a.id });
  await api("POST", "/friends", a.token, { id: b.id });
  const friends = await api("GET", "/friends", a.token);
  assert.ok(friends.data.friends.some((p) => p.id === b.id), "встречные заявки дают дружбу");
});

test("server: notifications for messages, friend requests and trades", async () => {
  const a = await account("note_a");
  const b = await account("note_b");
  await api("POST", "/friends", a.token, { id: b.id });
  const request = (await api("GET", "/friends/requests", b.token)).data.incoming[0];
  await api("POST", `/friends/requests/${request.requestId}/accept`, b.token);

  await api("POST", `/chat/dm/${b.id}`, a.token, { body: "один" });
  await api("POST", `/chat/dm/${b.id}`, a.token, { body: "два" });
  const feed = await api("GET", "/notifications", b.token);
  const dms = feed.data.items.filter((n) => n.kind === "dm");
  assert.equal(dms.length, 1, "повторные сообщения от одного игрока не плодят уведомления");
  assert.ok(feed.data.unread >= 1);

  const requestFeed = await api("GET", "/notifications", a.token);
  assert.ok(requestFeed.data.items.some((n) => n.kind === "friend_accepted"), "автор заявки узнаёт о принятии");

  const read = await api("POST", "/notifications/read", b.token, {});
  assert.equal(read.status, 200);
  const cleared = await api("GET", "/notifications", b.token);
  assert.equal(cleared.data.unread, 0);
});

test("server: event stream requires login and sends hello", async () => {
  const anon = await fetch(`${BASE}/events`);
  assert.equal(anon.status, 401);
  const user = await account("sse_user");
  const res = await fetch(`${BASE}/events`, { headers: { Authorization: `Bearer ${user.token}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = res.body.getReader();
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /event: hello/);
  await reader.cancel();
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
  assert.equal(lot.gear.identified, true, "опознанный лот виден целиком");
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
  assert.equal(guard.data.duel.state.turn, "b", "защита не заканчивает ход");
  assert.equal(guard.data.duel.state.b.guard, true);
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

test("server: сохранение героя проверяется на сервере, а не принимается на слово", async () => {
  const cheater = await account("cheat_save");
  const me = await api("GET", "/me", cheater.token);
  const base = me.data.profile.player;

  const unknownGear = await api("PUT", "/me", cheater.token, {
    player: { ...base, armory: [{ ...gear("x1"), baseId: "excalibur_admin" }] },
    unlockedFloor: 1,
    bestFloor: 1,
  });
  assert.equal(unknownGear.status, 400, "неизвестная база снаряжения отклонена");

  const tooStrong = await api("PUT", "/me", cheater.token, {
    player: { ...base, stats: { str: 10, agi: 10, int: 10 } },
    unlockedFloor: 1,
    bestFloor: 1,
  });
  assert.equal(tooStrong.status, 400, "характеристики сверх очков уровня отклонены");

  const cleaned = await api("PUT", "/me", cheater.token, {
    player: { ...base, gold: 99_999_999, equip: { ...base.equip, mainHand: "ghost-uid" }, hacked: true },
    unlockedFloor: 1,
    bestFloor: 1,
  });
  assert.equal(cleaned.status, 200, JSON.stringify(cleaned.data));

  const after = await api("GET", "/me", cheater.token);
  const saved = after.data.profile.player;
  assert.equal(saved.equip.mainHand, null, "uid, которого нет в арсенале, снят");
  assert.ok(saved.gold <= 1_000_000, `золото ограничено потолком: ${saved.gold}`);
  assert.equal(saved.hacked, undefined, "посторонние поля не сохраняются");
  assert.ok(saved.hp > 0 && saved.hp <= me.data.profile.player.hp + 1000);
});

test("server: player profile shows equipment and stats, hides gold, chest, bag and record", async () => {
  const owner = await account("prof_owner");
  const viewer = await account("prof_viewer");
  await savePlayer(owner.token, (p) => {
    p.gold = 4242;
    p.armory = [gear("blade-1")];
    p.equip = { ...p.equip, mainHand: "blade-1" };
  });
  const ownerSaved = (await api("GET", "/me", owner.token)).data.profile.player;
  const res = await api("GET", `/players/${owner.id}/profile`, viewer.token);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const { profile } = res.data;
  assert.deepEqual(profile.stats, { str: ownerSaved.stats.str, agi: ownerSaved.stats.agi, int: ownerSaved.stats.int });
  assert.equal(profile.equip.mainHand.item.baseId, "sword", "надетый предмет виден");
  assert.equal(profile.equip.mainHand.identified, true, "опознанный предмет отдаётся целиком");
  assert.equal(profile.equip.offHand, null, "пустой слот пуст");
  const text = JSON.stringify(res.data);
  for (const hidden of ["gold", "bag", "pouch", "bestFloor", "archetype", "armory", "statMilestones"]) {
    assert.equal(text.includes(`"${hidden}"`), false, `поле ${hidden} не отдаётся`);
  }
  const anon = await api("GET", `/players/${owner.id}/profile`, null);
  assert.equal(anon.status, 401);
});

test("server: неопознанный лот на рынке не раскрывает редкость и характеристики чужому игроку", async () => {
  const seller = await account("hidden_seller");
  const buyer = await account("hidden_buyer");
  await savePlayer(seller.token, (p) => {
    p.armory = [{ ...gear("h1"), identified: false, rarity: "epic", statRolls: { hp: 33, armor: 4 } }];
    p.gold = 100;
  });
  await savePlayer(buyer.token, (p) => {
    p.armory = [];
    p.gold = 500;
  });
  const listed = await api("POST", "/market", seller.token, { itemUid: "h1", price: 90 });
  assert.equal(listed.status, 200, JSON.stringify(listed.data));

  const asBuyer = (await api("GET", "/market", buyer.token)).data.listings.find((l) => l.sellerName === "hidden_seller");
  assert.ok(asBuyer);
  assert.equal(asBuyer.gear.identified, false);
  assert.equal(asBuyer.gear.item.rarity, undefined, "редкость скрыта");
  assert.equal(asBuyer.gear.item.statRolls, undefined, "статы скрыты");
  assert.equal(asBuyer.gear.item.baseId, "sword");
  assert.equal(asBuyer.gear.item.level, 1);

  const asSeller = (await api("GET", "/market", seller.token)).data.listings.find((l) => l.sellerName === "hidden_seller");
  assert.equal(asSeller.gear.identified, true, "свой лот виден полностью");
  assert.equal(asSeller.gear.item.rarity, "epic");
});

test("server: players and market are paged by 20", async () => {
  const many = [];
  for (let i = 0; i < 23; i++) many.push(await account(`page_${String(i).padStart(2, "0")}`));
  const viewer = many[0];
  const all = [];
  for (let offset = 0; ; offset += 20) {
    const page = await api("GET", `/players?limit=20&offset=${offset}`, viewer.token);
    assert.equal(page.status, 200);
    assert.ok(page.data.players.length <= 20);
    all.push(...page.data.players);
    if (!page.data.hasMore) break;
    assert.equal(page.data.players.length, 20, "полная порция до конца списка");
  }
  const ids = all.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "без повторов между порциями");
  assert.ok(many.slice(1).every((u) => ids.includes(u.id)), "все новые игроки попали в список");
  assert.equal(ids.includes(viewer.id), false, "себя в списке нет");
});

test("server: event stream receives chat events from other players", async () => {
  const listener = await account("stream_listener");
  const speaker = await account("stream_speaker");
  const res = await fetch(`${BASE}/events`, { headers: { Authorization: `Bearer ${listener.token}` } });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const sent = await api("POST", "/chat/global", speaker.token, { body: "привет всем" });
  assert.equal(sent.status, 200);
  const deadline = Date.now() + 3000;
  while (!seen.includes("event: chat") && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    seen += decoder.decode(value);
  }
  assert.match(seen, /event: chat/);
  await reader.cancel();
});

test("server: first chat load returns the newest messages, not the oldest", async () => {
  const author = await account("chat_long");
  for (let i = 1; i <= 205; i++) {
    await api("POST", "/chat/global", author.token, { body: `м${i}` });
  }
  const first = await api("GET", "/chat/global?after=0", author.token);
  assert.equal(first.data.messages.length, 200);
  assert.equal(first.data.messages.at(-1).body, "м205", "последнее сообщение на месте");
  assert.equal(first.data.messages[0].body, "м6", "самые старые из лишних отброшены");
  const ids = first.data.messages.map((m) => m.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), "порядок по времени");

  const next = await api("GET", `/chat/global?after=${ids.at(-1)}`, author.token);
  assert.equal(next.data.messages.length, 0, "дальше приходят только новые");
});

/* ─────────────────────────── портреты ─────────────────────────── */

async function rawUpload(token, buffer, type = "image/jpeg") {
  const res = await fetch(BASE + "/me/portrait", {
    method: "PUT",
    headers: { "Content-Type": type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: buffer,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : {} };
}

async function sampleJpeg(width = 600, height = 400) {
  const sharp = require("sharp");
  return sharp({ create: { width, height, channels: 3, background: "#886644" } }).jpeg().toBuffer();
}

test("server: портрет: загрузка обрезается до 256×256 WEBP и виден в списке, профиле и чате", async () => {
  const hero = await account("portrait_hero");
  const other = await account("portrait_other");

  const up = await rawUpload(hero.token, await sampleJpeg());
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(typeof up.data.portrait, "number");

  const img = await fetch(`${BASE}/players/${hero.id}/portrait`, { headers: { Authorization: `Bearer ${other.token}` } });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/webp");
  const meta = await require("sharp")(Buffer.from(await img.arrayBuffer())).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 256);
  assert.equal(meta.height, 256);

  const list = await api("GET", "/players?q=portrait_hero", other.token);
  const seen = list.data.players.find((p) => p.id === hero.id);
  assert.equal(seen.portrait, up.data.portrait, "версия портрета в списке игроков");

  const profile = await api("GET", `/players/${hero.id}/profile`, other.token);
  assert.equal(profile.data.profile.portrait, up.data.portrait, "версия портрета в профиле");

  const mine = await api("GET", "/me", hero.token);
  assert.equal(mine.data.profile.portrait, up.data.portrait, "версия портрета в собственном профиле");

  await api("POST", "/chat/global", hero.token, { body: "с портретом" });
  const chat = await api("GET", "/chat/global?after=0", other.token);
  const msg = chat.data.messages.find((m) => m.body === "с портретом");
  assert.equal(msg.fromPortrait, up.data.portrait, "версия портрета автора в сообщении");
});

test("server: портрет: отказ по формату, размеру и без входа", async () => {
  const user = await account("portrait_reject");
  const text = await rawUpload(user.token, Buffer.from("это не картинка"), "image/png");
  assert.equal(text.status, 415, "текст вместо картинки");

  const big = Buffer.alloc(2_000_001);
  big[0] = 0xff;
  big[1] = 0xd8;
  big[2] = 0xff;
  const tooBig = await rawUpload(user.token, big);
  assert.equal(tooBig.status, 413, "больше 2 МБ");

  const anon = await rawUpload(null, await sampleJpeg());
  assert.equal(anon.status, 401);
  const open = await fetch(`${BASE}/players/${user.id}/portrait`);
  assert.equal(open.status, 404, "без портрета картинки нет, но и вход не нужен");

  const broken = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
  const bad = await rawUpload(user.token, broken);
  assert.equal(bad.status, 415, "сигнатура есть, а декодировать нечего");
});

test("server: портрет: замена меняет версию, ETag даёт 304, удаление убирает картинку", async () => {
  const user = await account("portrait_swap");
  const first = await rawUpload(user.token, await sampleJpeg(300, 300));
  await new Promise((r) => setTimeout(r, 5));
  const second = await rawUpload(user.token, await sampleJpeg(200, 500), "image/jpeg");
  assert.ok(second.data.portrait > first.data.portrait, "новая версия");

  const url = `${BASE}/players/${user.id}/portrait`;
  const img = await fetch(url, { headers: { Authorization: `Bearer ${user.token}` } });
  const etag = img.headers.get("etag");
  assert.ok(etag && etag.includes(String(second.data.portrait)));
  const cached = await fetch(url, { headers: { Authorization: `Bearer ${user.token}`, "If-None-Match": etag } });
  assert.equal(cached.status, 304);

  const del = await api("DELETE", "/me/portrait", user.token);
  assert.equal(del.status, 200);
  const gone = await fetch(url, { headers: { Authorization: `Bearer ${user.token}` } });
  assert.equal(gone.status, 404);
  const mine = await api("GET", "/me", user.token);
  assert.equal(mine.data.profile.portrait, null);
});

test("server: профиль: опознанный предмет отдаётся целиком, неопознанный — без характеристик и редкости", async () => {
  const owner = await account("gear_owner");
  const viewer = await account("gear_viewer");
  await savePlayer(owner.token, (p) => {
    p.armory = [
      { ...gear("blade-known"), rarity: "rare", statRolls: { hp: 33, armor: 0 } },
      {
        uid: "amu-1",
        baseId: "amulet",
        slot: "amulet",
        level: 1,
        gearClass: "light",
        kind: "accessory",
        wear: "new",
        wearMult: 1.325,
        rarity: "rare",
        identified: false,
        statMult: 1,
        effects: ["regen"],
      },
    ];
    p.equip = { ...p.equip, mainHand: "blade-known", amulet: "amu-1" };
  });

  const res = await api("GET", `/players/${owner.id}/profile`, viewer.token);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const { equip } = res.data.profile;

  const known = equip.mainHand;
  assert.equal(known.identified, true);
  assert.equal(known.item.rarity, "rare", "у опознанного видна редкость");
  assert.deepEqual(known.item.statRolls, { hp: 33, armor: 0 }, "у опознанного видны броски");

  const amulet = equip.amulet;
  assert.equal(amulet.identified, false, "неопознанный отмечен");
  assert.equal(amulet.item.baseId, "amulet");
  assert.equal(typeof amulet.item.classLabel, "string", "подпись класса есть");
  assert.equal(amulet.item.level, 1);
  assert.equal(typeof amulet.item.peek.name, "string", "подсказка первого эффекта аксессуара");
  assert.equal(typeof amulet.item.peek.detail, "string");
  const amuletText = JSON.stringify(amulet);
  for (const hidden of ["rarity", "statRolls", "wearMult", "statMult", "effects", "effectRolls"]) {
    assert.equal(amuletText.includes(`"${hidden}"`), false, `поле ${hidden} неопознанного не отдаётся`);
  }
});

/* ───────────── карта похода и полный герой в базе ───────────── */

function mapRun(extra = {}) {
  const size = 8;
  const walls = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(false));
  return {
    floor: 3,
    maze: {
      size,
      h: walls(size + 1, size),
      v: walls(size, size + 1),
      start: { x: 0, y: 0 },
      stairs: { x: 7, y: 7 },
      boss: { x: 6, y: 6 },
      bossDefeated: false,
      doors: [],
      openedDoors: [],
      chests: [5],
      openedChests: [],
      keys: [],
      takenKeys: [],
      events: [],
      usedEvents: [],
      monsters: [20, 44],
      traps: [33],
      rooms: [{ x: 1, y: 1, w: 2, h: 2, kind: "hall", name: "Зал", pillars: [] }],
      dist: Array.from({ length: size }, () => Array(size).fill(-1)),
    },
    pos: { x: 3, y: 2 },
    prevPos: { x: 2, y: 2 },
    seen: { "0,0": true, "3,2": true },
    gold: 40,
    loot: ["potion_s"],
    gearLoot: [gear("r1")],
    keys: 0,
    steps: 12,
    log: ["Спуск на этаж 3.", "Шаг вправо."],
    torchTurns: 5,
    mapRevealed: false,
    burning: 0,
    battleCell: null,
    clearedMonsters: [],
    revealedTraps: [],
    revealedEvents: [],
    sprungTraps: [],
    questCarry: [],
    ...extra,
  };
}

test("server: герой и карта похода сохраняются целиком и возвращаются как были", async () => {
  const hero = await account("map_resume");
  const base = (await api("GET", "/me", hero.token)).data.profile.player;
  const player = {
    ...base,
    level: 4,
    stats: { str: 3, agi: 2, int: 2 },
    statPoints: 0,
    gold: 300,
    bag: { potion_s: 2 },
    pouch: ["potion_s", null, null, null, null],
    armory: [
      { ...gear("w1"), baseId: "sword", dmgMult: 1.25 },
      { ...gear("a1"), baseId: "sword", armorQuality: 0.6, armorSkill: "heavy_wall" },
    ],
    equip: { ...base.equip, mainHand: "w1" },
    statuses: { wound: 0, curse: 0, poison: 0, woundTick: 2, burnTick: 3 },
  };
  const run = mapRun();
  const put = await api("PUT", "/me", hero.token, { player, unlockedFloor: 3, bestFloor: 3, run });
  assert.equal(put.status, 200, JSON.stringify(put.data));

  const me = await api("GET", "/me", hero.token);
  const saved = me.data.profile.player;
  assert.deepEqual(saved.pouch, ["potion_s", null, null, null, null], "сумка сохраняется");
  assert.equal(saved.armory[0].dmgMult, 1.25, "множитель урона оружия сохраняется");
  assert.equal(saved.armory[1].armorQuality, 0.6, "качество брони сохраняется");
  assert.equal(saved.armory[1].armorSkill, "heavy_wall", "приём брони сохраняется");
  assert.equal(saved.statuses.woundTick, 2, "тик эффекта между боями сохраняется");
  assert.equal(saved.statuses.burnTick, 3);
  assert.equal(saved.level, 4);

  const resumed = me.data.profile.run;
  assert.ok(resumed, "карта похода возвращается");
  assert.deepEqual(resumed.pos, { x: 3, y: 2 }, "клетка та же");
  assert.equal(resumed.floor, 3);
  assert.equal(resumed.gold, 40);
  assert.equal(resumed.steps, 12);
  assert.equal(resumed.torchTurns, 5);
  assert.deepEqual(resumed.loot, ["potion_s"]);
  assert.equal(resumed.gearLoot[0].uid, "r1");
  assert.deepEqual(resumed.log, run.log);
  assert.deepEqual(resumed.maze.monsters, [20, 44], "монстры на тех же клетках");
  assert.deepEqual(resumed.maze.chests, [5]);
  assert.equal(resumed.maze.h.length, 9, "стены карты на месте");
  assert.deepEqual(resumed.seen, { "0,0": true, "3,2": true });

  const leftForLobby = await api("PUT", "/me", hero.token, { player: saved, unlockedFloor: 3, bestFloor: 3, run: null });
  assert.equal(leftForLobby.status, 200);
  assert.equal((await api("GET", "/me", hero.token)).data.profile.run, null, "в лобби карта снимается");
});

test("server: карта похода с испорченными данными не записывается как есть", async () => {
  const cheat = await account("map_cheat");
  const player = (await api("GET", "/me", cheat.token)).data.profile.player;
  const outside = await api("PUT", "/me", cheat.token, {
    player, unlockedFloor: 1, bestFloor: 1, run: mapRun({ pos: { x: 99, y: 0 } }),
  });
  assert.equal(outside.status, 200, JSON.stringify(outside.data));
  const clamped = await api("GET", "/me", cheat.token);
  assert.deepEqual(clamped.data.profile.run.pos, { x: 7, y: 0 }, "клетка ограничена границей карты");
  const unknownLoot = await api("PUT", "/me", cheat.token, {
    player, unlockedFloor: 1, bestFloor: 1, run: mapRun({ loot: ["excalibur_admin"] }),
  });
  assert.equal(unknownLoot.status, 400, "неизвестный предмет в добыче отклонён");
  const hugeGold = await api("PUT", "/me", cheat.token, {
    player, unlockedFloor: 1, bestFloor: 1, run: mapRun({ gold: 99_999_999 }),
  });
  assert.equal(hugeGold.status, 200);
  const capped = await api("GET", "/me", cheat.token);
  assert.equal(capped.data.profile.run.gold, 1_000_000, "золото похода ограничено потолком");
});

test("server: открытый бой сохраняется с точкой и возвращается; неизвестное существо отклоняется", async () => {
  const fighter = await account("map_fight");
  const player = (await api("GET", "/me", fighter.token)).data.profile.player;
  const open = await api("PUT", "/me", fighter.token, {
    player: { ...player, hp: 7, stamina: 35 },
    unlockedFloor: 1,
    bestFloor: 1,
    run: mapRun({ battleCell: 20, pendingFight: { foe: "vermin", boss: false } }),
  });
  assert.equal(open.status, 200, JSON.stringify(open.data));
  const back = (await api("GET", "/me", fighter.token)).data.profile;
  assert.deepEqual(back.run.pendingFight, { foe: "vermin", boss: false }, "открытый бой возвращается");
  assert.equal(back.run.battleCell, 20);
  assert.equal(back.player.hp, 7, "здоровье из боя сохраняется");
  assert.equal(back.player.stamina, 35, "выносливость из боя сохраняется");

  const bossOpen = await api("PUT", "/me", fighter.token, {
    player, unlockedFloor: 1, bestFloor: 1, run: mapRun({ pendingFight: { foe: "any_boss_id", boss: true } }),
  });
  assert.equal(bossOpen.status, 200, "страж яруса принимается с любым id из своего списка");

  const unknown = await api("PUT", "/me", fighter.token, {
    player, unlockedFloor: 1, bestFloor: 1, run: mapRun({ pendingFight: { foe: "excalibur_admin", boss: false } }),
  });
  assert.equal(unknown.status, 400, "неизвестный враг отклонён");
});

test("server: запись рынка не стирает карту похода продавца", async () => {
  const seller = await account("map_market");
  await savePlayer(seller.token, (p) => {
    p.armory = [gear("mk1")];
  });
  const saved = await api("PUT", "/me", seller.token, {
    player: (await api("GET", "/me", seller.token)).data.profile.player,
    unlockedFloor: 1,
    bestFloor: 1,
    run: mapRun(),
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const listed = await api("POST", "/market", seller.token, { itemUid: "mk1", price: 90 });
  assert.equal(listed.status, 200, JSON.stringify(listed.data));
  const after = await api("GET", "/me", seller.token);
  assert.equal(after.data.profile.player.armory.length, 0, "предмет ушёл в эскроу");
  assert.ok(after.data.profile.run, "карта осталась на месте после записи рынка");
  assert.deepEqual(after.data.profile.run.pos, { x: 3, y: 2 });
});
