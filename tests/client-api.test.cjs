const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-client-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

/** Сетевой клиент собираем как ESM: в нём используется import.meta.env. */
async function loadApi() {
  const outfile = path.join(temp, "api.mjs");
  buildSync({
    entryPoints: ["src/net/api.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  return import(pathToFileURL(outfile).href);
}

function loadUi(entry, name) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-client-"));
  const outfile = path.join(dir, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

const HTML = '<!doctype html><html><head><title>404</title></head><body><h1>Not Found</h1></body></html>';

test("API client turns an HTML response into a readable network error, never a JSON crash", async () => {
  const { ApiClient, ApiError } = await loadApi();
  const restore = stubFetch(async () => new Response(HTML, { status: 404, headers: { "content-type": "text/html" } }));
  try {
    const api = new ApiClient();
    await assert.rejects(
      () => api.register("Игрок", "secret123"),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 0, "HTML от хостинга — это отсутствие сервера, а не ошибка запроса");
        assert.match(err.message, /недоступен/i);
        assert.ok(!/Unexpected token|JSON\.parse|SyntaxError/.test(err.message), err.message);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("health requires real JSON with ok:true, otherwise the game stays offline", async () => {
  const { ApiClient, ApiError } = await loadApi();
  const cases = [
    new Response(HTML, { status: 200, headers: { "content-type": "text/html" } }),
    new Response("", { status: 200 }),
    new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "content-type": "application/json" } }),
    new Response("{oops", { status: 200, headers: { "content-type": "application/json" } }),
  ];
  for (const response of cases) {
    const restore = stubFetch(async () => response.clone());
    try {
      await assert.rejects(() => new ApiClient().health(), (err) => err instanceof ApiError && err.status === 0);
    } finally {
      restore();
    }
  }

  const restore = stubFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
  try {
    assert.deepEqual(await new ApiClient().health(), { ok: true });
  } finally {
    restore();
  }
});

test("API error messages from the server pass through, network failures stay friendly", async () => {
  const { ApiClient, ApiError } = await loadApi();

  let restore = stubFetch(
    async () => new Response(JSON.stringify({ error: "Такой логин уже занят" }), { status: 409, headers: { "content-type": "application/json" } }),
  );
  try {
    await assert.rejects(
      () => new ApiClient().register("Игрок", "secret123"),
      (err) => err instanceof ApiError && err.status === 409 && err.message === "Такой логин уже занят",
    );
  } finally {
    restore();
  }

  restore = stubFetch(async () => {
    throw new TypeError("fetch failed");
  });
  try {
    await assert.rejects(
      () => new ApiClient().login("Игрок", "secret123"),
      (err) => err instanceof ApiError && err.status === 0 && err.message === "Сервер недоступен",
    );
  } finally {
    restore();
  }

  restore = stubFetch(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }),
  );
  try {
    const ok = await new ApiClient().register("Игрок", "secret123");
    assert.deepEqual(ok, { ok: true }, "успешный ответ возвращается как есть");
  } finally {
    restore();
  }
});

test("auth screen explains an unavailable server instead of showing a failing form", () => {
  // Одна сборка на провайдер и экран: иначе React-контекст окажется разным.
  const entry = path.join(temp, "auth-entry.tsx");
  fs.writeFileSync(
    entry,
    [
      `export { OnlineProvider } from ${JSON.stringify(path.resolve("src/net/online.tsx"))};`,
      `export { AuthView } from ${JSON.stringify(path.resolve("src/views/AuthView.tsx"))};`,
    ].join("\n"),
  );
  const { OnlineProvider, AuthView } = loadUi(entry, "auth-entry");
  const html = renderToStaticMarkup(
    React.createElement(OnlineProvider, null, React.createElement(AuthView)),
  );
  assert.ok(html.includes("Повторить подключение"), "есть кнопка повторной проверки");
  assert.ok(html.includes("Играть без аккаунта"), "можно уйти в соло-режим");
  assert.ok(html.includes("GitHub Pages"), "объяснение про статический хостинг");
  assert.ok(html.includes("VITE_API_URL"), "подсказка, как включить онлайн");
  assert.ok(html.includes("npm run server"), "подсказка про локальный сервер");
  assert.ok(!html.includes("Создать аккаунт"), "форма не показывается без связи");
});
