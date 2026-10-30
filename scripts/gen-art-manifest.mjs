#!/usr/bin/env node
/**
 * Сканирует public/images и собирает манифест индивидуальных иллюстраций.
 * Запускайте после добавления новых картин: npm run art:manifest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src/game/artManifest.ts");

function scan(dir, prefix) {
  const abs = path.join(root, "public/images", dir);
  if (!fs.existsSync(abs)) return {};
  return Object.fromEntries(
    fs.readdirSync(abs)
      .filter((f) => f.endsWith(".jpg") || f.endsWith(".png") || f.endsWith(".webp"))
      .sort()
      .map((f) => [path.basename(f, path.extname(f)), `images/${prefix}${f}`])
  );
}

const monsters = scan("monsters", "monsters/");
const items = scan("items", "items/");

// Базовые портреты, которые уже лежат в корне images.
const legacyFoes = {
  vermin: "images/foe-vermin.jpg",
  husk: "images/foe-husk.jpg",
  bone: "images/foe-bone.jpg",
  wraith: "images/foe-wraith.jpg",
  brute: "images/foe-brute.jpg",
  boss_warden: "images/foe-boss.jpg",
};

const foeArt = { ...legacyFoes, ...monsters };

const body = `/**
 * АВТОМАТИЧЕСКИ СОБРАННЫЙ МАНИФЕСТ ИЛЛЮСТРАЦИЙ.
 * Не правьте вручную: запустите npm run art:manifest.
 * Ключ — id существа/предмета, значение — путь от корня public.
 */
export const FOE_ART: Readonly<Record<string, string>> = ${JSON.stringify(foeArt, null, 2)};

export const ITEM_ART: Readonly<Record<string, string>> = ${JSON.stringify(items, null, 2)};

export function foeArtSrc(id: string): string | null {
  return FOE_ART[id] ?? null;
}

export function itemArtSrc(id: string): string | null {
  return ITEM_ART[id] ?? null;
}
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
console.log(`art manifest: ${Object.keys(foeArt).length} foes, ${Object.keys(items).length} items -> ${path.relative(root, out)}`);
