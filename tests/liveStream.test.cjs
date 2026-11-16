const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-live-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const outfile = path.join(temp, "live.cjs");
buildSync({ entryPoints: ["src/net/live.ts"], outfile, bundle: true, platform: "node", format: "cjs" });
const { parseSseBlock, LiveStream } = require(outfile);

test("sse: блок разбирается в событие и данные", () => {
  assert.deepEqual(parseSseBlock("event: chat\ndata: {\"channel\":\"global\"}"), { event: "chat", data: "{\"channel\":\"global\"}" });
  assert.deepEqual(parseSseBlock("event: hello\ndata: {}"), { event: "hello", data: "{}" });
  assert.equal(parseSseBlock(": ping"), null, "комментарии-пинги не события");
  assert.deepEqual(parseSseBlock("retry: 3000"), null, "служебная строка без данных пропускается");
  assert.deepEqual(parseSseBlock("data: a\ndata: b"), { event: "message", data: "a\nb" });
});

/** Фейковый window с таймерами, которые запускаем вручную. */
function fakeWindow() {
  const timers = [];
  globalThis.window = {
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: () => undefined,
  };
  return timers;
}

function streamOf(text) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
}

test("sse: события доходят подписчикам, обрыв ведёт к переподключению", async () => {
  const timers = fakeWindow();
  const calls = [];
  const responses = [
    streamOf("event: hello\ndata: {}\n\nevent: chat\ndata: {\"channel\":\"global\"}\n\n"),
    null,
  ];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    const body = responses.shift();
    if (body === null) return { ok: false, status: 500, body: null };
    return { ok: true, status: 200, body };
  };

  const live = new LiveStream("/api/events", () => "tok-1");
  const got = [];
  live.on("chat", (payload) => got.push(payload));
  const statuses = [];
  live.onStatus((c) => statuses.push(c));

  live.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls[0].url, "/api/events");
  assert.equal(calls[0].auth, "Bearer tok-1", "токен уходит в заголовке");
  assert.deepEqual(got, [{ channel: "global" }]);
  assert.equal(statuses[0], true, "поток отмечен как подключённый");

  // Поток закончился: клиент должен запланировать повтор.
  assert.equal(statuses.at(-1), false);
  assert.ok(timers.length >= 1, "переподключение запланировано");
  const retry = timers.at(-1);
  assert.ok(retry.ms >= 1000, "пауза не меньше секунды");

  live.stop();
});

test("sse: 401 останавливает переподключение", async () => {
  const timers = fakeWindow();
  globalThis.fetch = async () => ({ ok: false, status: 401, body: null });
  const live = new LiveStream("/api/events", () => "bad");
  live.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(timers.length, 0, "без входа повторы не нужны");
  assert.equal(live.connected, false);
});
