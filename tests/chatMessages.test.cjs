const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-chatmsg-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const outfile = path.join(temp, "chatMessages.cjs");
buildSync({ entryPoints: ["src/views/community/chatMessages.ts"], outfile, bundle: true, platform: "node", format: "cjs" });
const { mergeMessages, lastMessageId, CHAT_KEEP } = require(outfile);

const msg = (id) => ({ id, fromId: "a", fromName: "A", body: `m${id}`, createdAt: id, channel: "global" });
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));

test("chat: новые сообщения добавляются, старые не теряются", () => {
  const merged = mergeMessages(range(1, 3), range(4, 5));
  assert.deepEqual(merged.map((m) => m.id), [1, 2, 3, 4, 5]);
});

test("chat: повтор сообщения не дублируется", () => {
  const merged = mergeMessages(range(1, 3), range(3, 4));
  assert.deepEqual(merged.map((m) => m.id), [1, 2, 3, 4]);
});

test("chat: пустой приход не стирает историю", () => {
  assert.deepEqual(mergeMessages(range(1, 3), []).map((m) => m.id), [1, 2, 3]);
});

test("chat: на экране держим последние CHAT_KEEP сообщений", () => {
  const merged = mergeMessages(range(1, CHAT_KEEP), range(CHAT_KEEP + 1, CHAT_KEEP + 2));
  assert.equal(merged.length, CHAT_KEEP);
  assert.equal(merged[0].id, 3);
  assert.equal(merged.at(-1).id, CHAT_KEEP + 2);
});

test("chat: последний id берётся по максимуму", () => {
  assert.equal(lastMessageId([]), 0);
  assert.equal(lastMessageId(range(4, 9)), 9);
});
