#!/usr/bin/env node
/**
 * Проверяет, что каждое существо и каждый предмет имеют индивидуальную иллюстрацию.
 * Пока часть картин ещё генерируется, скрипт печатает отчёт и не падает.
 * После завершения арт-покрытия запустите с --strict.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
const tmp = fs.mkdtempSync(path.join(root, ".art-check-"));
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(tmp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const content = load("content");
const manifest = load("artManifest");

const foes = [...content.ENEMIES, ...content.BOSSES].map((x) => x.id);
const items = [...Object.keys(content.GEAR_BASES), ...Object.keys(content.ITEMS)];

function report(label, ids, map) {
  const missing = ids.filter((id) => !map[id] || !fs.existsSync(path.join(root, "public", map[id])));
  console.log(`${label}: ${ids.length - missing.length}/${ids.length} индивидуальных иллюстраций`);
  if (missing.length) console.log("  нет:", missing.join(", "));
  return missing;
}

const missingFoes = report("Монстры", foes, manifest.FOE_ART);
const missingItems = report("Предметы", items, manifest.ITEM_ART);
const missing = [...missingFoes, ...missingItems];
if (strict && missing.length) process.exit(1);
