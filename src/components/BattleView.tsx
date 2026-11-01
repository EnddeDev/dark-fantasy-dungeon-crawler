import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, Shield, Skull, Swords, X } from "lucide-react";
import {
  ENEMY_MOVE_META,
  ITEMS,
  LEGENDARY_PASSIVES,
  RARE_AFFIXES,
  THREAT_META,
  WEAR_META,
  isImmuneTo,
  scaledGearStats,
  consumableIntReq,
  consumableScaleLabel,
} from "../game/content";
import { GEAR_EFFECTS, GEAR_PASSIVES, effectDetail } from "../game/gearEffects";
import { MONSTER_RACE_META, MONSTER_TYPE_META, monsterEvade, raceTraits } from "../game/monsters";
import { epicSkillDesc } from "../game/content";
import { combatReadout, queuePreview, type BattleState, type PlayerAction } from "../game/battle";
import { FoePortrait } from "./FoeArt";
import { ItemArt } from "./ItemArt";
import { Btn, Meter, Tag } from "./ui";
import { BiomeRule, BiomeTag, biomeStyle } from "./BiomeLabel";
import { isBattleCurse } from "../game/traps";
import { statDamage } from "../game/statFormulas";
import { enemyEffectChips, playerEffectChips } from "../game/effects";
import { EffectChips } from "./EffectChips";

/** Римская нумерация для строк инициативы. */
function roman(n: number): string {
  const map: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let v = n;
  for (const [num, sym] of map) while (v >= num) { out += sym; v -= num; }
  return out || "—";
}

export function BattleView({
  battle,
  onAct,
  onEnemyTurn,
  onContinue,
}: {
  battle: BattleState;
  onAct: (a: PlayerAction) => void;
  onEnemyTurn: () => void;
  onContinue: () => void;
}) {
  const [menu, setMenu] = useState<"main" | "skill" | "item">("main");
  const [codex, setCodex] = useState(false);
  const [full, setFull] = useState(false);
  const b = battle;
  const myTurn = !b.over && b.queue[b.idx] === "p";
  const e = b.enemy;
  const earnedXp = b.loot.xp;

  useEffect(() => {
    if (b.over) return;
    if (b.queue[b.idx] !== "e") return;
    const t = window.setTimeout(onEnemyTurn, 720);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.idx, b.round, b.over]);

  const act = (a: PlayerAction) => {
    setMenu("main");
    onAct(a);
  };

  const side = b.queue[b.idx];
  const ws = b.p.weaponSkill;
  const wsReq = ws ? Math.max(1, ws.intReq - b.p.intDiscount) : 0;
  const wsIntOk = ws ? b.p.stats.int >= wsReq : false;
  const wsReady = ws && wsIntOk && b.p.weaponCd === 0;

  /* Ведомость пересчитывается каждый рендер: эффекты сразу видны в числах */
  const r = combatReadout(b);
  const effArmor = r.armor;
  const changed = (base: string, now: string) => base !== now;

  /* Иконки эффектов: у героя — под здоровьем, у монстра — поверх портрета.
     Строки сводки, которые временно усилены, подсвечиваются синим. */
  const playerChips = playerEffectChips(b);
  const enemyChips = enemyEffectChips(b);
  const highlight = new Set(playerChips.map((c) => c.highlight).filter(Boolean));
  const highlightedRows: Record<string, boolean> = {
    "Урон оружием": highlight.has("dmg"),
    "Броня": highlight.has("armor"),
    "Входящий урон": highlight.has("armor"),
    "Ходов в раунде": highlight.has("ap"),
    "Уклонение": highlight.has("evade"),
    "Критический удар": highlight.has("crit"),
  };

  const rows: {
    label: string;
    base: string;
    now: string;
    hint: string;
    badge?: { text: string; tone: "rubric" | "flame" | "verd" };
  }[] = [
    {
      label: "Урон оружием",
      base: `${r.baseMin}–${r.baseMax}`,
      now: `${r.dmgMin}–${r.dmgMax}`,
      badge:
        b.p.statuses.curse > 0
          ? { text: `−${b.p.statuses.cursePower ?? 30}% Проклятие (${isBattleCurse(b.p.statuses.curse) ? "до конца боя" : `${b.p.statuses.curse} р.`})`, tone: "rubric" }
          : b.p.statuses.rage > 0
          ? { text: `Ярость: +10%/10% недостающих ОЗ (${b.p.statuses.rage} р.)`, tone: "flame" }
          : undefined,
      hint: `${b.p.weaponName} + ${statDamage(b.p.stats.str)} от СИЛ`,
    },
    {
      label: "По противнику",
      base: `${r.dmgMin}–${r.dmgMax}`,
      now: `${r.effMin}–${r.effMax}`,
      badge: e.guard
        ? { text: "−50% Защита врага", tone: "rubric" }
        : e.passive?.id === "stone_hide"
        ? { text: "−25% Каменная шкура", tone: "rubric" }
        : undefined,
      hint: `после брони ${e.armor}${e.guard ? " и его защиты" : ""}${e.passive?.id === "stone_hide" ? " и каменной шкуры" : ""}`,
    },
    {
      label: "Броня",
      base: `${r.armorBase}`,
      now: `${r.armor}`,
      badge:
        b.p.statuses.sundered > 0
          ? { text: `−${b.p.statuses.sundered} Раскол лат`, tone: "rubric" }
          : undefined,
      hint: "вычитается из физического урона по тебе",
    },
    {
      label: "Входящий урон",
      base: `${e.atk[0]}–${e.atk[1]}`,
      now: `${r.inMin}–${r.inMax}`,
      badge:
        b.p.guard && b.p.statuses.stone > 0
          ? { text: "−50% Защита · −30% Каменная кожа", tone: "verd" }
          : b.p.guard
          ? { text: "−50% Защита", tone: "verd" }
          : b.p.statuses.stone > 0
          ? { text: `−30% Каменная кожа (${b.p.statuses.stone} р.)`, tone: "verd" }
          : undefined,
      hint: `в защите: ${r.inGuardMin}–${r.inGuardMax}`,
    },
    {
      label: "Ходов в раунде",
      base: `${r.apBase}`,
      now: `${r.ap}`,
      badge:
        b.p.statuses.haste > 0
          ? { text: `+1 Скорость (${b.p.statuses.haste} р.)`, tone: "flame" }
          : b.p.statuses.stunAp > 0
          ? { text: `Оглушение: пропуск ${b.p.statuses.stunAp} хода`, tone: "rubric" }
          : undefined,
      hint: "у кого больше — тот всегда раньше",
    },
    { label: "Уклонение", base: `${Math.round(r.evade * 100)}%`, now: `${Math.round(r.evade * 100)}%`, hint: "шанс полного промаха врага" },
    ...(r.missChance > 0
      ? [{ label: "Промах в мраке", base: "0%", now: `${Math.round(r.missChance * 100)}%`, hint: "дополнительная проверка для физических ударов обоих участников" }]
      : []),
    { label: "Критический удар", base: `${Math.round(r.crit * 100)}%`, now: `${Math.round(r.crit * 100)}%`, hint: `множитель ×${r.critDamage.toFixed(2)}` },
    { label: "Стойкость", base: `${Math.round(r.resist * 100)}%`, now: `${Math.round(r.resist * 100)}%`, hint: "шанс не получить негативный эффект" },
    { label: "Маг. сопротивление", base: `${Math.round(r.magicResist * 100)}%`, now: `${Math.round(r.magicResist * 100)}%`, hint: "снижение магического урона" },
    { label: "Укрепление", base: `${Math.round(r.fortify * 100)}%`, now: `${Math.round(r.fortify * 100)}%`, hint: "снижение физического урона" },
    { label: "Характеристики", base: `${b.p.stats.str}/${b.p.stats.agi}/${b.p.stats.int}`, now: `${b.p.stats.str}/${b.p.stats.agi}/${b.p.stats.int}`, hint: "СИЛ / ЛОВ / ИНТ" },
  ];

  const effects = [
    ...r.dmgMods.map((m) => ({ ...m, group: "урон" as const })),
    ...r.defMods.map((m) => ({ ...m, group: "защита" as const })),
    ...r.enemyMods.map((m) => ({ ...m, group: "враг" as const })),
  ];
  const activeEffects = effects.filter((m) => m.id !== "immortal" || !b.p.immortalUsed);

  return (
    <div className="biome-surface flex min-h-screen flex-col bg-soot" data-biome={b.biome} style={biomeStyle(b.biome)}>
      {/* ── ПОЛОСА ИНИЦИАТИВЫ ── */}
      <div className="border-b-2 border-flamedim/50 bg-black/65 px-4 py-3 sm:px-6">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-xl uppercase tracking-[0.18em] text-flamehi sm:text-2xl">
              {b.isBoss ? "Битва со Стражем" : "Бой"}
            </h2>
            <span className="font-mono text-lg tab text-flame">РАУНД {roman(b.round)}</span>
            <BiomeTag biome={b.biome} />
          </div>
          <span
            className={`font-display text-sm uppercase tracking-[0.2em] ${
              b.over ? "text-mute" : myTurn ? "text-flame" : "text-rubric"
            }`}
          >
            {b.over ? "бой окончен" : myTurn ? "▶ твой ход" : side === "e" ? "● ход противника" : "…"}
          </span>
        </div>

        <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
          {queuePreview(b, 16).map((s, i) => {
            const ap = s === "p" ? b.p.ap : b.enemy.ap;
            const cur = i === 0;
            const mine = s === "p";
            return (
              <span
                key={i}
                className={`flex shrink-0 flex-col items-center justify-center border-2 px-3 py-1.5 transition-all duration-200 ${
                  mine
                    ? cur
                      ? "border-flame bg-flame text-ink shadow-[0_0_26px_-4px_#e0a33c]"
                      : "border-flamedim/70 bg-flame/10 text-flame"
                    : cur
                      ? "border-rubric bg-rubric text-parch"
                      : "border-rubric/45 bg-rubric/10 text-rubric/90"
                } ${cur ? "scale-[1.06]" : "opacity-80"}`}
                title={mine ? "твой ход" : "ход противника"}
              >
                <span className="font-mono text-3xl leading-none tab sm:text-4xl">{ap}</span>
                <span className="mt-1 font-display text-[0.72rem] uppercase tracking-[0.18em]">
                  {mine ? "ты" : "враг"}
                </span>
              </span>
            );
          })}
          <span className="ml-auto flex shrink-0 flex-col justify-center border border-line bg-black/40 px-3 py-1.5 text-right font-mono text-[0.84rem] leading-tight text-mute">
            <span>
              ходов у тебя: <b className="text-flame">{b.p.ap}</b>
            </span>
            <span>
              у врага: <b className="text-rubric">{e.ap}</b>
            </span>
            <span className="text-[0.78rem] text-flamedim">у кого больше — тот идёт первым</span>
          </span>
        </div>
      </div>
      {b.biome !== "classic" && (
        <div className="border-b border-line bg-black/35 px-4 py-2 sm:px-6">
          <BiomeRule biome={b.biome} />
        </div>
      )}

      <div className="grid flex-1 items-start xl:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1.05fr)_minmax(300px,0.9fr)]">
        {/* ПЕРСОНАЖ */}
        <div className="order-3 min-w-0 border-b border-line p-4 sm:p-6 xl:order-1 xl:col-start-1 xl:border-b-0">
          <div className="border border-line bg-slab/80 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h3 className="font-display text-lg uppercase tracking-[0.14em] text-flamehi">Покоритель</h3>
                <span className="font-mono text-[0.84rem] text-mute">
                  оружие: <b className="text-parch">{b.p.weaponName}</b>
                </span>
              </div>
              <span className="font-mono text-[0.84rem] text-mute">
                броня {effArmor} · уклон {Math.round(b.p.evade * 100)}%
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
              <span className="sc text-rubric">Здоровье</span>
              <Meter value={b.p.hp} max={b.p.maxHp} tone="rubric" />
              <span className="font-mono text-sm tab text-parch">{b.p.hp}/{b.p.maxHp}</span>
            </div>

            {/* Эффекты героя: под здоровьем, как и положено по раскладке панели */}
            {playerChips.length > 0 && (
              <div className="relative z-20 mt-2">
                <EffectChips chips={playerChips} label="эффекты героя" />
              </div>
            )}

            {/* ВЕДОМОСТЬ: сколько наношу и сколько защищаюсь */}
            <div className="mt-3 border-t border-line/70 pt-3">
              <div className="flex items-center justify-between">
                <span className="sc">Сводка боя</span>
                <button
                  onClick={() => setFull((v) => !v)}
                  className="sc flex items-center gap-1 hover:text-flame"
                  aria-expanded={full}
                >
                  {full ? "свернуть" : "полный разбор"}
                  <ChevronDown size={12} className={full ? "rotate-180" : ""} aria-hidden />
                </button>
              </div>

              <dl className="mt-2 grid gap-x-5 gap-y-1.5 text-[0.94rem] sm:grid-cols-2">
                {rows.map((row) => {
                  const live = changed(row.base, row.now);
                  return (
                    <div
                      key={row.label}
                      className={`border-b border-line/40 pb-1.5 ${
                        highlightedRows[row.label] ? "boon-row -mx-1 rounded-sm px-1" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <dt className="truncate text-mute">{row.label}</dt>
                        {highlightedRows[row.label] && (
                          <span aria-hidden className="boon-mark font-mono text-[0.7rem]" title="временно усилено">
                            ▲
                          </span>
                        )}
                        {row.badge && (
                          <span
                            className={`border px-1 py-0.2 font-mono text-[0.78rem] font-bold ${
                              row.badge.tone === "rubric"
                                ? "border-rubric/60 bg-rubric/15 text-rubric"
                                : row.badge.tone === "flame"
                                ? "border-flame/60 bg-flame/15 text-flamehi"
                                : "border-verd/60 bg-verd/15 text-verd"
                            }`}
                          >
                            {row.badge.text}
                          </span>
                        )}
                        <dd className="ml-auto flex shrink-0 items-baseline gap-1.5 font-mono tab">
                          {live && <span className="text-[0.86rem] text-mute line-through decoration-rubric/70">{row.base}</span>}
                          <span
                            key={row.now}
                            className={`value-pop text-[1.02rem] font-bold ${
                              live ? (row.badge?.tone === "rubric" ? "text-rubric" : "text-flame") : "text-flamehi"
                            }`}
                          >
                            {row.now}
                          </span>
                        </dd>
                      </div>
                      <div className="truncate font-mono text-[0.76rem] text-mute/80">{row.hint}</div>
                    </div>
                  );
                })}
              </dl>

              <div className="mt-2 grid grid-cols-3 gap-2 border border-flamedim/40 bg-black/35 p-2 text-center">
                <div>
                  <div key={`mn${r.effMin}`} className="value-pop font-mono text-lg tab leading-none text-flame">{r.effMin}</div>
                  <div className="sc mt-1 text-[0.68rem]">мин. по врагу</div>
                </div>
                <div>
                  <div key={`av${r.dmgAvg}`} className="value-pop font-mono text-lg tab leading-none text-flamehi">
                    {Math.round((r.effMin + r.effMax) / 2)}
                  </div>
                  <div className="sc mt-1 text-[0.68rem]">средн.</div>
                </div>
                <div>
                  <div key={`mx${r.effMax}`} className="value-pop font-mono text-lg tab leading-none text-flame">{r.effMax}</div>
                  <div className="sc mt-1 text-[0.68rem]">макс. по врагу</div>
                </div>
              </div>

              {full && (
                <div className="mt-3 space-y-1.5 border-t border-line/70 pt-2.5 text-[0.92rem] leading-snug">
                  <p className="text-mute">
                    Расчёт удара: <b className="text-parch">{b.p.hit[0]}–{b.p.hit[1]}</b> по оружию +{" "}
                    <b className="text-parch">{statDamage(b.p.stats.str)}</b> от СИЛ (2 + {b.p.stats.str})
                    {r.dmgMods.filter((m) => m.mult && m.mult !== 1).length
                      ? `, затем множители ${r.dmgMods
                          .filter((m) => m.mult && m.mult !== 1)
                          .map((m) => `×${m.mult}`)
                          .join(" ")}`
                      : ""}
                    .
                  </p>
                  <p className="text-mute">
                    Защита: броня <b className="text-parch">{r.armorBase}</b> вычитается из физического урона
                    {r.armor !== r.armorBase ? ` (сейчас ${r.armor})` : ""}, Защита режет всё вдвое, каменная кожа —
                    на 30%, уклон <b className="text-parch">{Math.round(r.evade * 100)}%</b> отменяет удар целиком.
                  </p>
                  <p className="text-mute">
                    Очередь: твои ходы <b className="text-parch">{r.ap}</b> против{" "}
                    <b className="text-parch">{e.ap}</b> у {e.def.name}; ходы в ленте вверху — числа ходов, а не урон.
                  </p>
                  {(b.p.rareAffixes.length > 0 || b.p.legendaryPassives.length > 0 || b.p.gearEffects.length > 0 || b.p.gearPassives.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {b.p.rareAffixes.map((ra, i) => (
                        <Tag key={ra + i} tone="verd">
                          {RARE_AFFIXES[ra]?.name ?? ra}
                        </Tag>
                      ))}
                      {b.p.legendaryPassives.map((lp, i) => (
                        <Tag key={lp + i} tone="rubric">
                          ★ {LEGENDARY_PASSIVES[lp]?.name ?? lp}
                        </Tag>
                      ))}
                      {b.p.gearEffects.map((ef, i) => (
                        <Tag key={`ef-${i}`} tone="flame">{GEAR_EFFECTS[ef].name}</Tag>
                      ))}
                      {b.p.gearPassives.map((gp, i) => (
                        <Tag key={`gp-${i}`} tone="flame">{GEAR_PASSIVES[gp].name}</Tag>
                      ))}
                    </div>
                  )}
                  <p className="font-mono text-[0.84rem] text-mute">
                    статусы:{" "}
                    {b.p.statuses.rage > 0 ? `ярость ${b.p.statuses.rage} · ` : ""}
                    {b.p.statuses.curse > 0 ? `проклятие ${isBattleCurse(b.p.statuses.curse) ? "до конца боя" : b.p.statuses.curse} · ` : ""}
                    {b.p.statuses.wound > 0 ? `рана ${b.p.statuses.wound} · ` : ""}
                    {b.p.statuses.poison > 0 ? `яд ${b.p.statuses.poison} · ` : ""}
                    {b.p.statuses.haste > 0 ? `скорость ${b.p.statuses.haste} · ` : ""}
                    {b.p.statuses.stone > 0 ? `каменная кожа ${b.p.statuses.stone} · ` : ""}
                    {b.p.statuses.noHeal > 0 ? `лечение перекрыто ${b.p.statuses.noHeal} · ` : ""}
                    {b.p.statuses.darkness > 0 ? `мрак ${b.p.statuses.darkness} · ` : ""}
                    {b.p.statuses.sealAttack > 0 || b.p.statuses.sealSkills > 0 ? "запуган · " : ""}
                    {!b.p.statuses.rage && !b.p.statuses.curse && !b.p.statuses.wound && !b.p.statuses.poison && !b.p.statuses.haste &&
                    !b.p.statuses.stone && !b.p.statuses.noHeal && !b.p.statuses.darkness && !b.p.statuses.sealAttack && !b.p.statuses.sealSkills
                      ? "чисто"
                      : ""}
                  </p>
                </div>
              )}
            </div>

            {/* Действующие эффекты: что именно они меняют в характеристиках */}
            <div className="mt-3 border-t-2 border-line/80 bg-black/40 p-3">
              <div className="flex items-baseline justify-between">
                <span className="sc text-flamedim">Эффекты в бою</span>
                <span className="font-mono text-[0.78rem] text-mute">{activeEffects.length} активных</span>
              </div>
              {activeEffects.length === 0 ? (
                <p className="mt-1.5 text-[0.92rem] italic text-mute">
                  Все характеристики стандартные: нет действующих проклятий и усилений.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {activeEffects.map((m) => (
                    <li
                      key={m.group + m.id}
                      className={`rise flex items-start gap-2 border-l-2 bg-black/50 px-2.5 py-1.5 ${
                        m.good ? "border-verd" : "border-rubric"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <b
                            className={`font-display text-[0.98rem] uppercase tracking-[0.08em] ${
                              m.good ? "text-verd" : "text-rubric"
                            }`}
                          >
                            {m.label}
                          </b>
                          {typeof m.rounds === "number" && (
                            <span className="ml-auto shrink-0 font-mono text-[0.82rem] tab text-flamehi">
                              осталось: {m.rounds} {m.rounds === 1 ? "раунд" : m.rounds < 5 ? "раунда" : "раундов"}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[0.9rem] leading-snug text-parch/85">{m.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {b.flash && b.flash.target === "p" && (
                <span key={b.flash.id} className="hitflash pointer-events-none mt-1 block font-mono text-lg text-rubric">
                  {b.flash.kind === "heal" ? `+${b.flash.amount}` : b.flash.kind === "miss" ? "мимо" : `−${b.flash.amount}`}
                </span>
              )}
            </div>
          </div>
        </div>


        {/* ДЕЙСТВИЯ — центральная колонка */}
        <div className="order-2 min-w-0 border-b border-line p-4 sm:p-6 xl:order-2 xl:col-start-2 xl:border-b-0">
          <div className="xl:sticky xl:top-4">
          <div className="border border-line bg-slab/95 p-4">
            <h3 className="sc mb-3 text-flamedim">Действия</h3>
            {!b.over && !myTurn && (
              <div className="mb-3 h-2 w-full overflow-hidden bg-black/50">
                <div className="h-full w-1/3 animate-pulse bg-rubric/60" />
              </div>
            )}

            {(b.p.statuses.sealAttack > 0 || b.p.statuses.sealSkills > 0 || b.p.statuses.sealItems > 0) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {b.p.statuses.sealAttack > 0 && <Tag tone="rubric">Печать оков: удар запрещён</Tag>}
                {b.p.statuses.sealSkills > 0 && <Tag tone="rubric">Печать забвения: приёмы запрещены</Tag>}
                {b.p.statuses.sealItems > 0 && <Tag tone="rubric">Печать немоты: расходники запрещены</Tag>}
              </div>
            )}
            {menu === "main" && (
              <div className="grid grid-cols-2 gap-2">
                <Btn tone="flame" disabled={!myTurn || b.p.statuses.sealAttack > 0} onClick={() => act({ type: "attack" })}>
                  Удар
                </Btn>
                <Btn tone={wsReady || b.p.epicSkills.length > 0 ? "flame" : "ghost"} disabled={!myTurn || b.p.statuses.sealSkills > 0} onClick={() => setMenu("skill")}>
                  Приёмы
                </Btn>
                <Btn disabled={!myTurn || b.p.statuses.sealItems > 0} onClick={() => setMenu("item")}>
                  Рюкзак
                </Btn>
                <Btn tone="verd" disabled={!myTurn} onClick={() => act({ type: "guard" })}>
                  Защита
                </Btn>
                <Btn tone="danger" disabled={!myTurn} onClick={() => act({ type: "flee" })}>
                  Сбежать
                </Btn>
              </div>
            )}

            {menu === "skill" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="sc">Приёмы оружия и способности снаряжения</span>
                  <button className="sc hover:text-flame" onClick={() => setMenu("main")}>
                    ← назад
                  </button>
                </div>
                <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                  {ws ? (
                    <button
                      disabled={!myTurn || !wsIntOk || b.p.weaponCd > 0}
                      onClick={() => act({ type: "weapon_skill" })}
                      className="flex items-center justify-between gap-3 border border-line bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-45"
                    >
                      <span>
                        <span className="block font-display text-[1.02rem] uppercase tracking-[0.1em] text-flamehi">
                          {ws.name} <span className="font-mono text-[0.82rem] text-mute">({b.p.weaponName})</span>
                        </span>
                        <span className="block text-[0.89rem] leading-snug text-mute">{ws.desc}</span>
                      </span>
                      <span className={`shrink-0 font-mono text-[0.84rem] ${!wsIntOk ? "text-rubric" : b.p.weaponCd > 0 ? "text-mute" : "text-verd"}`}>
                        {!wsIntOk ? `нужен ИНТ ${wsReq}` : b.p.weaponCd > 0 ? `перезар. ${b.p.weaponCd} р.` : "готово"}
                      </span>
                    </button>
                  ) : (
                    <p className="text-xs italic text-mute">У текущего оружия нет активного приёма.</p>
                  )}

                  {b.p.epicSkills.map((sk) => {
                    const req = Math.max(1, sk.intReq - b.p.intDiscount);
                    const intOk = b.p.stats.int >= req;
                    const cd = b.p.epicCds[sk.id] ?? 0;
                    return (
                      <button
                        key={sk.id}
                        disabled={!myTurn || !intOk || cd > 0}
                        onClick={() => act({ type: "epic_skill", id: sk.id })}
                        className="flex items-center justify-between gap-3 border border-flamedim/70 bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-45"
                      >
                        <span>
                          <span className="block font-display text-[1.02rem] uppercase tracking-[0.1em] text-flame">
                            [Эпич.] {sk.name}
                          </span>
                          <span className="block text-[0.89rem] leading-snug text-mute">{epicSkillDesc(sk.id, b.p.epicSkillLevels[sk.id] ?? 1)}</span>
                        </span>
                        <span className={`shrink-0 font-mono text-[0.84rem] ${!intOk ? "text-rubric" : cd > 0 ? "text-mute" : "text-verd"}`}>
                          {!intOk ? `нужен ИНТ ${req}` : cd > 0 ? `перезар. ${cd} р.` : "готово"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {menu === "item" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="sc">Свитки, зелья и метательное оружие</span>
                  <button className="sc hover:text-flame" onClick={() => setMenu("main")}>
                    ← назад
                  </button>
                </div>
                <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                  {Object.entries(b.bag).filter(([id]) => ITEMS[id]?.use && ITEMS[id]?.kind !== "special" && ITEMS[id]?.kind !== "reagent").length === 0 && (
                    <p className="text-sm italic text-mute">Рюкзак пуст: зелья, свитки и метательное оружие продаются в магазине.</p>
                  )}
                  {Object.entries(b.bag).filter(([id]) => ITEMS[id]?.use && ITEMS[id]?.kind !== "special" && ITEMS[id]?.kind !== "reagent").map(([id, n]) => {
                    const def = ITEMS[id];
                    const u = def.use!;
                    const req = consumableIntReq(def, b.p.intDiscount);
                    const intOk = b.p.stats.int >= req;
                    const fearImmune = u.type === "fear" && isImmuneTo(e.def.race, "fear");
                    const poisonImmune = u.type === "poison" && isImmuneTo(e.def.race, "poison");
                    const ok = intOk && myTurn && !fearImmune;
                    return (
                      <button
                        key={id}
                        disabled={!ok}
                        onClick={() => act({ type: "item", id })}
                        className="flex items-center justify-between gap-3 border border-line bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-40"
                      >
                        <span className="flex items-start gap-2">
                          <ItemArt id={id} name={def.name} size={34} framed={false} className="mt-0.5" />
                          <span>
                            <span className="block font-display text-[1.02rem] uppercase tracking-[0.1em] text-flamehi">
                              {def.name} <span className="font-mono text-[0.84rem] text-flame">×{n}</span>
                            </span>
                            <span className="block text-[0.89rem] leading-snug text-mute">{def.desc}</span>
                          </span>
                        </span>
                        <span className={`shrink-0 font-mono text-[0.86rem] ${intOk && !fearImmune && !poisonImmune ? "text-verd" : "text-rubric"}`}>
                          {fearImmune
                            ? "иммунитет к страху"
                            : poisonImmune
                              ? "яд не действует"
                              : intOk
                                ? req > 0
                                  ? `ИНТ ${req} · готово`
                                  : consumableScaleLabel(def)
                                    ? `${consumableScaleLabel(def).replace(" + ", "")} · готово`
                                    : "готово"
                                : `нужен ИНТ ${req}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ПРОТИВНИК И ХРОНИКА — правая колонка */}
        <div className="order-1 min-w-0 xl:order-3 xl:col-start-3 xl:border-l xl:border-line">
        {/* ПРОТИВНИК */}
        <div className="relative flex flex-col border-line bg-black/30">
          {/* Эффекты монстра — поверх портрета в левом верхнем углу.
              Слой вынесен из overflow-hidden, иначе подсказка обрезалась бы. */}
          {enemyChips.length > 0 && (
            <div className="absolute left-3 top-3 z-30 max-w-[76%]">
              <EffectChips chips={enemyChips} size={34} label="эффекты врага" />
            </div>
          )}
          <div className="relative aspect-[5/4] w-full overflow-hidden border-b border-line bg-soot">
            <FoePortrait id={e.def.id} art={e.def.art} name={e.def.name} />
            <div className="absolute inset-0 bg-gradient-to-t from-soot via-soot/10 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_40%,rgba(0,0,0,0.65)_100%)]" />
            {b.flash && b.flash.target === "e" && (
              <div
                key={b.flash.id}
                className={`hitflash pointer-events-none absolute inset-0 flex items-center justify-center ${
                  b.flash.kind === "guard" ? "bg-verd/25" : "bg-rubric/30"
                }`}
              >
                <span className="font-mono text-4xl text-parch drop-shadow-[0_2px_6px_#000]">
                  {b.flash.kind === "miss" ? "мимо" : b.flash.kind === "guard" ? "−" : `−${b.flash.amount}`}
                </span>
              </div>
            )}
            <div className="absolute right-3 top-14 flex flex-wrap justify-end gap-1.5">
              {b.isBoss && <Tag tone="rubric">БОСС ЭТАЖА</Tag>}
              <Tag tone="mute">ур. {e.level}</Tag>
            </div>
            <button
              onClick={() => setCodex(true)}
              className="absolute right-3 top-3 flex items-center gap-1.5 border border-flamedim bg-black/70 px-2.5 py-1.5 font-display text-[0.82rem] uppercase tracking-[0.14em] text-flame transition-colors hover:bg-flame hover:text-ink"
            >
              <BookOpen size={13} aria-hidden />
              Способности
            </button>
            <div className="absolute inset-x-0 bottom-0 p-4">
              {e.def.title && <div className="sc mb-0.5 text-rubric">{e.def.title}</div>}
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h3 className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">{e.def.name}</h3>
                <span className="font-mono text-sm tab text-parch">{e.hp}/{e.maxHp}</span>
              </div>
              <Meter value={e.hp} max={e.maxHp} tone="rubric" />
            </div>
          </div>

          <div className="space-y-2 border-b border-line bg-slab/80 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.84rem] text-mute">
              <span className="flex items-center gap-1.5 text-verd">
                <Skull size={13} aria-hidden />
                {MONSTER_TYPE_META[e.mtype].name} · {MONSTER_RACE_META[e.def.race].name.toLowerCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <Shield size={13} aria-hidden />
                уклонение {Math.round(monsterEvade(e.def.race, e.mtype) * 100)}%
              </span>
              <span className="flex items-center gap-1.5">
                <Shield size={13} aria-hidden />
                броня {e.armor}
              </span>
              <span className="flex items-center gap-1.5">
                <Swords size={13} aria-hidden />
                ходов {e.ap}
              </span>
              <span>урон {e.atk[0]}–{e.atk[1]}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={b.isBoss ? "rubric" : e.threat === "catastrophe" ? "rubric" : e.threat === "horror" ? "flame" : "verd"}>
                {b.isBoss ? "Босс" : THREAT_META[e.threat].name}
              </Tag>
              {e.passive && <Tag tone="rubric">{e.passive.name}</Tag>}
              {e.forceGuard > 0 && <Tag tone="verd">вынужден держать оборону</Tag>}
              {enemyChips.length > 0 && (
                <span className="font-mono text-[0.78rem] text-mute">
                  эффектов: {enemyChips.length} — наведи на иконки у портрета
                </span>
              )}
            </div>
            <p className="text-[0.92rem] italic leading-snug text-mute">{e.def.flavor}</p>
          </div>

        </div>
          <div className="border-t border-line p-4">
            <div className="border border-line bg-black/45 p-4">
              <div className="sc mb-2">Хроника боя</div>
              <div className="max-h-[38vh] space-y-1.5 overflow-y-auto pr-1 text-[0.98rem] leading-snug xl:max-h-[46vh]">
                {b.log.slice(-40).reverse().map((l) => (
                  <div
                    key={l.id}
                    className={`border-l-2 pl-2 ${
                      l.kind === "p" ? "border-flamedim text-parch" : l.kind === "e" ? "border-rubric text-parch/85" : "border-line text-mute italic"
                    }`}
                  >
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── КОДЕКС ПРОТИВНИКА: поля рукописи справа ── */}
      {codex && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button className="absolute inset-0 bg-black/70" onClick={() => setCodex(false)} aria-label="Закрыть кодекс" />
          <aside className="rise relative flex h-full w-[min(27rem,100vw)] flex-col overflow-y-auto border-l-2 border-flamedim bg-slab shadow-[-30px_0_60px_-30px_#000]">
            <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-slab2/95 px-4 py-3 backdrop-blur">
              <div>
                <span className="sc text-flamedim">Кодекс противника</span>
                <h3 className="font-display text-xl uppercase tracking-[0.1em] text-flamehi">{e.def.name}</h3>
                <p className="font-mono text-[0.84rem] text-mute">
                  {MONSTER_TYPE_META[e.mtype].name} · {MONSTER_RACE_META[e.def.race].name} · уровень {e.level} · {b.isBoss ? "Босс" : THREAT_META[e.threat].name} · этаж {b.floor}
                </p>
              </div>
              <button onClick={() => setCodex(false)} className="mt-1 text-mute hover:text-rubric" aria-label="Закрыть">
                <X size={18} />
              </button>
            </header>

            <div className="space-y-4 px-4 py-4 text-[0.98rem] leading-snug">
              <section>
                <h4 className="sc mb-2 text-flame">Что он делает</h4>
                <ul className="space-y-2">
                  {[...new Set(e.moves)].map((mv) => {
                    const meta = ENEMY_MOVE_META[mv];
                    if (!meta) return null;
                    return (
                      <li key={mv} className="border-l-2 border-rubric/70 pl-3">
                        <span className="font-display uppercase tracking-[0.08em] text-flamehi">{meta.name}</span>
                        <div className="text-mute">{meta.desc}</div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {e.def.abilitiesDesc && (
                <section>
                  <h4 className="sc mb-2 text-rubric">Особый устав</h4>
                  <ul className="space-y-1 text-[0.94rem] text-parch/85">
                    {e.def.abilitiesDesc.map((a, i) => (
                      <li key={i}>• {a}</li>
                    ))}
                  </ul>
                </section>
              )}

              {e.passive && (
                <section className="border border-rubric/60 bg-rubric/10 p-3">
                  <h4 className="sc mb-1 text-rubric">Пассивная способность</h4>
                  <div className="font-display uppercase tracking-[0.08em] text-flamehi">{e.passive.name}</div>
                  <p className="mt-0.5 text-mute">{e.passive.desc}</p>
                </section>
              )}

              {e.effects.length > 0 && (
                <section className="border border-flamedim/60 bg-flame/5 p-3">
                  <h4 className="sc mb-2 text-flame">Эффекты противника (уровень {e.level})</h4>
                  <ul className="space-y-1 text-[0.94rem] text-parch/85">
                    {e.effects.map((id) => (
                      <li key={id}>
                        <b className="text-flamehi">{GEAR_EFFECTS[id]?.name ?? id}</b>: {effectDetail(id, e.level)}
                      </li>
                    ))}
                  </ul>
                  {b.isBoss && <p className="mt-2 font-mono text-[0.84rem] text-rubric">Сопротивление эффектам: 25%</p>}
                </section>
              )}

              <section>
                <h4 className="sc mb-2 text-verd">Что на него действует и что нет</h4>
                <ul className="space-y-1 text-[0.94rem] text-parch/85">
                  <li>
                    Броня <b className="text-parch">{e.armor}</b> — вычитается из физических ударов;{" "}
                    <b>пробивающие</b> приёмы и свитки игнорируют.
                  </li>
                  <li>
                    Отравить: {isImmuneTo(e.def.race, "poison") ? <b className="text-rubric">нельзя</b> : <b className="text-verd">можно</b>}
                    {" · "}раскровить: {isImmuneTo(e.def.race, "bleed") ? <b className="text-rubric">нельзя</b> : <b className="text-verd">можно</b>}
                    {" · "}испугать:{" "}
                    {isImmuneTo(e.def.race, "fear") ? <b className="text-rubric">нельзя</b> : <b className="text-verd">можно</b>}
                  </li>
                  <li>
                    В ужасе пропускает ходы, в страхе — держит защиту. Холод снижает его урон на 30%.
                  </li>
                </ul>
              </section>

              <section>
                <h4 className="sc mb-2 text-flamedim">Что оставляет после себя</h4>
                <p className="text-[0.94rem] text-parch/85">{b.isBoss ? "Босс оставляет золото, припасы и трофей: 50% редкий, 10% эпический, 1% легендарный." : THREAT_META[e.threat].desc}</p>
                <p className="mt-1 font-mono text-[0.86rem] text-mute">
                  опыт: {e.xp} XP · золото: {e.gold[0]}–{e.gold[1]}
                </p>
              </section>

              <section className="border-t border-line/70 pt-3">
                <h4 className="sc mb-2 text-flamedim">Род: {MONSTER_RACE_META[e.def.race].name}</h4>
                <p className="text-[0.94rem] leading-snug text-parch/85">{MONSTER_RACE_META[e.def.race].note}</p>
                <ul className="mt-2 space-y-1 text-[0.92rem] text-mute">
                  <li>• Тип: <b className="text-parch">{MONSTER_TYPE_META[e.mtype].name.toLowerCase()}</b> — {MONSTER_TYPE_META[e.mtype].note}</li>
                  {raceTraits(e.def.race).map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              </section>
            </div>
          </aside>
        </div>
      )}

      {b.over === "win" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4 backdrop-blur-[3px]">
          <div className="rise w-full max-w-md border border-flamedim bg-slab p-6 text-center shadow-[0_40px_90px_-30px_#000]">
            <div className="sc text-flamedim">{b.isBoss ? "Страж лестницы пал!" : "Победа"}</div>
            <h3 className="mt-1 font-title text-3xl text-flamehi">{e.def.name} повержен</h3>
            <div className="mt-5 space-y-2 border border-line bg-black/40 p-4">
              <div className="flex items-baseline justify-between">
                <span className="sc">Опыт</span>
                <span className="font-mono text-lg tab text-verd">+{earnedXp} XP</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="sc">Золото</span>
                <span className="font-mono text-xl tab text-flame">+{b.loot.gold}</span>
              </div>
              {(b.loot.items.length > 0 || b.loot.gear.length > 0) && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-line/60 pt-3">
                  {b.loot.items.map((id, i) => (
                    <span key={id + i} className="flex items-center gap-1.5 border border-line bg-black/40 px-2 py-1">
                      <ItemArt id={id} name={ITEMS[id]?.name} size={28} framed={false} />
                      <span className="font-mono text-[0.84rem] text-parch">{ITEMS[id]?.name ?? id}</span>
                    </span>
                  ))}
                  {b.loot.gear.map((g) => {
                    const st = scaledGearStats(g);
                    return (
                      <span key={g.uid} className="flex items-center gap-1.5 border border-line bg-black/40 px-2 py-1">
                        <ItemArt id={g.baseId} name={st.base.name} size={30} />
                        <span className="font-mono text-[0.84rem] text-parch">
                          {st.base.name} · {WEAR_META[g.wear].name} · не исследовано
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <Btn tone="flame" className="mt-5 w-full py-3" onClick={onContinue}>
              {b.isBoss ? "Путь к лестнице открыт" : "Вернуться в коридор"}
            </Btn>
            <p className="mt-2 font-mono text-[0.84rem] text-mute">
              здоровье остаётся с тобой: {b.p.hp}/{b.p.maxHp}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
