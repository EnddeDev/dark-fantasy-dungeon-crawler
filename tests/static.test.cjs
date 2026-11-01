const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-static-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function loadStatic() {
  const outfile = path.join(temp, "static.cjs");
  buildSync({
    entryPoints: ["server/static.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["node:fs", "node:path", "node:http"],
  });
  return require(outfile);
}

/** Поднимаем крошечный сервер, который просто делегирует раздачу файлов. */
async function withSite(dir, run) {
  const site = path.join(temp, dir);
  fs.mkdirSync(path.join(site, "images"), { recursive: true });
  fs.writeFileSync(path.join(site, "index.html"), "<!doctype html><title>СУМРАК</title>");
  fs.writeFileSync(path.join(site, "images", "gate.jpg"), "jpeg-bytes");
  fs.writeFileSync(path.join(site, "app-ABCDEF123.js"), "console.log(1)");
  fs.writeFileSync(path.join(temp, "secret.txt"), "не отдавать");

  const { createStaticHandler } = loadStatic();
  const serve = createStaticHandler(site);
  const server = http.createServer((req, res) => {
    if (serve(req, res)) return;
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("no");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("server serves the built game, assets and SPA fallback", async () => {
  await withSite("site-a", async (base) => {
    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    assert.equal(index.headers.get("cache-control"), "no-store", "index.html не кэшируется");
    assert.match(await index.text(), /СУМРАК/);

    const image = await fetch(`${base}/images/gate.jpg`);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type"), /image\/jpeg/);

    const asset = await fetch(`${base}/app-ABCDEF123.js`);
    assert.match(asset.headers.get("cache-control"), /immutable/, "хешированные файлы кэшируются надолго");

    const spa = await fetch(`${base}/какой-то/путь`);
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /СУМРАК/, "неизвестные пути отдают приложение");
  });
});

test("server never exposes files outside dist and leaves /api to the API", async () => {
  await withSite("site-b", async (base) => {
    for (const attack of ["/%2e%2e/secret.txt", "/..%2fsecret.txt", "/../secret.txt"]) {
      const res = await fetch(`${base}${attack}`);
      const body = await res.text();
      assert.ok(!body.includes("не отдавать"), `утечка по ${attack}`);
    }
    const api = await fetch(`${base}/api/health`);
    assert.equal(api.status, 404, "запросы /api не перехватываются раздачей файлов");
  });
});
