import { useState } from "react";
import { ChevronDown, Coins, FlaskConical, Package, Shield, Skull, Swords } from "lucide-react";
import {
  BOSSES,
  ENEMIES,
  THREAT_META,
  lootTableFor,
  rarityWeightsFor,
} from "../game/content";
import type { Threat } from "../game/types";
import { mazeSizeForFloor } from "../game/maze";
import { MONSTER_RACE_META, MONSTER_TYPE_META, raceTraits } from "../game/monsters";
import { FoePortrait } from "./FoeArt";
import { RARITY_TEXT } from "./ui";

const THREATS: Threat[] = ["normal", "horror", "catastrophe"];
const LOOT_LABELS = [
  ["nothing", "Ничего", Package],
  ["gold", "Золото", Coins],
  ["reagents", "Реагенты", FlaskConical],
  ["supplies", "Припасы", Package],
  ["gear", "Снаряжение", Swords],
] as const;

const MOVE_LABELS: Record<string, string> = {
  attack: "атака",
  heavy: "сокрушение",
  guard: "защита",
  wound: "рана",
  curse: "проклятие",
  drain: "похищение",
  sunder: "раскол брони",
  bell_stun: "оглушение",
  poison: "яд",
  multi: "двойной выпад",
  terror: "насмешка",
  seal_items: "печать немоты",
  seal_skills: "печать забвения",
  seal_attack: "печать оков",
  intimidate: "запугивание",
  darkness: "мрак",
  cold_touch: "холодное касание",
  hell_force: "сила ада",
};

export function Bestiary() {
  const [floor, setFloor] = useState(1);
  const [offset, setOffset] = useState(0);
  const [threat, setThreat] = useState<Threat>("normal");
  const level = Math.max(0, floor + offset);
  const table = lootTableFor(level, floor, threat);
  const rarity = rarityWeightsFor(threat, level - floor);
  const size = mazeSizeForFloor(floor);

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-4">
        <span className="sc text-flamedim">Полевой определитель</span>
        <h3 className="font-title text-3xl text-flamehi">Бестиарий и угрозы</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mute">
          Выберите этаж и угрозу, чтобы увидеть точные шансы добычи. Уровень монстра отличается от этажа на −1, 0
          или +1; на первом этаже возможен уровень 0.
        </p>
      </header>

      <div className="grid gap-4 border border-line bg-black/30 p-4 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="sc mb-1 block">Этаж</span>
            <input
              type="number"
              min={1}
              max={99}
              value={floor}
              onChange={(e) => setFloor(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
              className="w-20 border border-line bg-soot px-2 py-2 font-mono text-sm text-parch outline-none focus:border-flamedim"
            />
          </label>
          <label className="block">
            <span className="sc mb-1 block">Уровень относительно этажа</span>
            <select
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              className="border border-line bg-soot px-2 py-2 font-mono text-sm text-parch outline-none focus:border-flamedim"
            >
              <option value={-1}>−1 (20%)</option>
              <option value={0}>0 (55%)</option>
              <option value={1}>+1 (25%)</option>
            </select>
          </label>
          <div>
            <span className="sc mb-1 block">Угроза</span>
            <div className="flex flex-wrap gap-1">
              {THREATS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={threat === t}
                  onClick={() => setThreat(t)}
                  className={`border px-2.5 py-2 font-mono text-[0.86rem] transition-colors ${
                    threat === t
                      ? t === "catastrophe"
                        ? "border-rubric bg-rubric/20 text-parch"
                        : t === "horror"
                          ? "border-flamedim bg-flame/20 text-flamehi"
                          : "border-verd bg-verd/15 text-verd"
                      : "border-line text-mute hover:text-parch"
                  }`}
                >
                  {THREAT_META[t].name} · {Math.round(THREAT_META[t].chance * 100)}%
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 self-end font-mono text-[0.88rem] text-mute lg:justify-end">
          <span>карта <b className="text-parch">{size}×{size}</b></span>
          <span>уровень монстра <b className="text-flamehi">{level}</b></span>
          <span>этаж <b className="text-parch">{floor}</b></span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="border border-line bg-slab/70 p-4">
          <h4 className="font-display text-lg uppercase tracking-[0.12em] text-flamehi">Шансы добычи</h4>
          <p className="mt-1 text-xs leading-snug text-mute">{THREAT_META[threat].desc}</p>
          <div className="mt-4 space-y-2.5">
            {LOOT_LABELS.map(([key, label, Icon]) => (
              <div key={key} className="grid grid-cols-[110px_1fr_44px] items-center gap-2 text-[0.92rem]">
                <span className="flex items-center gap-1.5 text-parch/85"><Icon size={13} aria-hidden />{label}</span>
                <span className="h-2.5 border border-line bg-black/50">
                  <span
                    className={`block h-full transition-[width] duration-300 ${key === "gear" ? "bg-flame" : key === "nothing" ? "bg-line" : "bg-verd/70"}`}
                    style={{ width: `${table[key]}%` }}
                  />
                </span>
                <span className="text-right font-mono tab text-flamehi">{Math.round(table[key])}%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.88rem] leading-snug text-mute">
            Для обычного монстра база: 30% ничего, 30% золото, 20% реагенты, 15% припасы, 5% снаряжение.
            Каждый уровень выше этажа переносит по 1 п.п. из «ничего» в каждую полезную категорию.
          </p>
        </section>

        <section className="border border-line bg-slab/70 p-4">
          <h4 className="font-display text-lg uppercase tracking-[0.12em] text-flamehi">Редкость снаряжения</h4>
          <div className="mt-4 space-y-2.5">
            {(["common", "rare", "epic", "legendary"] as const).map((tier) => (
              <div key={tier} className="grid grid-cols-[110px_1fr_44px] items-center gap-2 text-[0.92rem]">
                <span className={RARITY_TEXT[tier]}>
                  {tier === "common" ? "Обычное" : tier === "rare" ? "Редкое" : tier === "epic" ? "Эпическое" : "Легендарное"}
                </span>
                <span className="h-2.5 border border-line bg-black/50">
                  <span
                    className="block h-full transition-[width] duration-300"
                    style={{
                      width: `${rarity[tier]}%`,
                      background: tier === "common" ? "#9a8672" : tier === "rare" ? "#5aa9e6" : tier === "epic" ? "#a78bfa" : "#f6d48a",
                    }}
                  />
                </span>
                <span className="text-right font-mono tab text-parch">{Math.round(rarity[tier] * 10) / 10}%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.88rem] leading-snug text-mute">
            База 60/30/8/2. Ужас, катастрофа и уровень выше этажа повышают шанс редкого, эпического и
            легендарного качества.
          </p>
        </section>
      </div>

      <section>
        <h4 className="mb-1 font-display text-lg uppercase tracking-[0.12em] text-flamehi">Обитатели этажей</h4>
        <p className="mb-3 text-[0.88rem] leading-snug text-mute">
          Здоровье, урон и броня указаны базовыми — тип монстра (сильный, ловкий, умный) меняет их при появлении.
        </p>
        <div className="divide-y divide-line border-y border-line">
          {ENEMIES.map((enemy) => {
            const available = enemy.minFloor <= floor;
            return (
              <article key={enemy.id} className={`grid gap-3 py-3 sm:grid-cols-[72px_1fr_auto] ${available ? "" : "opacity-55"}`}>
                <span className="block h-[72px] w-[72px] shrink-0 overflow-hidden border border-line">
                  <FoePortrait id={enemy.id} art={enemy.art} name={enemy.name} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h5 className="font-display text-base uppercase tracking-[0.08em] text-flamehi">{enemy.name}</h5>
                    <span className="font-mono text-[0.84rem] text-verd">
                      {MONSTER_TYPE_META[enemy.type].name} · {MONSTER_RACE_META[enemy.race].name.toLowerCase()}
                    </span>
                    <span className="font-mono text-[0.84rem] text-mute">с этажа {enemy.minFloor}</span>
                  </div>
                  <p className="mt-1 text-[0.92rem] italic leading-snug text-mute">{enemy.flavor}</p>
                  <p className="mt-1 font-mono text-[0.84rem] text-parch/75">
                    {[...new Set(enemy.moves)].map((mv) => MOVE_LABELS[mv] ?? mv).join(" · ")}
                  </p>
                  <p className="mt-0.5 text-[0.84rem] text-mute">{MONSTER_RACE_META[enemy.race].note}</p>
                  <p className="mt-0.5 font-mono text-[0.82rem] text-parch/60">
                    {[MONSTER_TYPE_META[enemy.type].note, ...raceTraits(enemy.race)].join(" · ")}
                  </p>
                </div>
                <div className="flex flex-row gap-3 font-mono text-[0.84rem] text-mute sm:flex-col sm:items-end sm:gap-1">
                  <span className="flex items-center gap-1"><Skull size={12} aria-hidden />{enemy.hp} ОЗ</span>
                  <span className="flex items-center gap-1"><Swords size={12} aria-hidden />{enemy.atk[0]}–{enemy.atk[1]}</span>
                  <span className="flex items-center gap-1"><Shield size={12} aria-hidden />{enemy.armor} брони</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <details className="group border border-line bg-black/25">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-display text-base uppercase tracking-[0.12em] text-rubric">
          Стражи лестниц
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="divide-y divide-line border-t border-line">
          {BOSSES.map((boss) => (
            <article key={boss.id} className="grid gap-3 p-4 sm:grid-cols-[72px_1fr]">
              <span className="block h-[72px] w-[72px] shrink-0 overflow-hidden border border-rubric/60">
                <FoePortrait id={boss.id} art={boss.art} name={boss.name} />
              </span>
              <div>
                <h5 className="font-display text-base uppercase tracking-[0.08em] text-flamehi">{boss.name}</h5>
                <p className="font-mono text-[0.84rem] text-rubric">
                  {boss.title} · {MONSTER_TYPE_META[boss.type].name} · {MONSTER_RACE_META[boss.race].name.toLowerCase()}
                </p>
                <p className="mt-0.5 text-[0.84rem] text-mute">{MONSTER_RACE_META[boss.race].note}</p>
                <ul className="mt-1.5 space-y-0.5 text-[0.92rem] text-parch/85">
                  {boss.abilitiesDesc?.map((a) => <li key={a}>• {a}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}
