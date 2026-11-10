import { useEffect, useRef, useState } from "react";
import { useFitInViewport } from "./useFitInViewport";
import { BookOpen, X } from "lucide-react";
import {
  ENEMY_MOVE_META,
  ITEMS,
  THREAT_META,
  WEAR_META,
  isImmuneTo,
  scaledGearStats,
  consumableIntReq,
  consumableScaleLabel,
} from "../game/content";
import { GEAR_EFFECTS, effectDetail } from "../game/gearEffects";
import { MONSTER_RACE_META, MONSTER_TYPE_META, WEAKNESS_STEP, raceTraits } from "../game/monsters";
import { STAT_META, armorSkillDesc, epicSkillDesc } from "../game/content";
import { STAMINA_BACKPACK, STAMINA_GUARD } from "../game/stamina";
import { ARCHETYPES } from "../game/archetypes";
import {
  ENEMY_COOLDOWN_MOVES,
  ENEMY_MOVE_COOLDOWN,
  MAX_CONCENTRATION,
  combatReadout,
  enemyArmorNow,
  enemyMoveCooldownLeft,
  enemyReadout,
  queuePreview,
  type BattleState,
  type EnemyMoveEffect,
  type EnemyMoveView,
  type PlayerAction,
  actionStaminaCost,
  ATTACK_KINDS,
  ATTACK_KIND_META,
  attackStaminaCost,
  heroAttackPreview,
  techniqueStaminaCost,
} from "../game/battle";
import { FoePortrait } from "./FoeArt";
import { ItemArt } from "./ItemArt";
import { SummaryRow, type SummaryRowData } from "./SummaryRow";
import type { MetricKey } from "./MetricBadge";
import { Btn, Meter, Tag } from "./ui";
import { BiomeRule, BiomeTag, biomeStyle } from "./BiomeLabel";
import { isBattleCurse } from "../game/traps";
import { statDamage } from "../game/statFormulas";
import { EFFECT_COLORS, durationLabel, enemyEffectChips, playerEffectChips, type EffectChip, type EffectIconId } from "../game/effects";
import { enemyEffects, learnedEffects, type TabEffect } from "../game/effectEntries";
import { EffectChips } from "./EffectChips";
import { EffectGlyph } from "./EffectIcon";
import { DamageTypeTag, ElementRow } from "./DamageTypeIcon";
import { itemDamageType, raceElementRows } from "../game/damageTypes";
import { skillReadiness } from "../game/skillReadiness";
import { consumablePreview } from "../game/consumablePreview";
import { POUCH_SLOTS } from "../game/pouch";
import { monsterActionsBonus, monsterDamageBonus, monsterEvasionBonus, monsterHealthBonus, monsterTechniqueBonus } from "../game/monsterStats";

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

/** Пауза перед ходом монстра и перед пропуском оглушённого героя: 0.5 секунды. */
const TURN_PAUSE_MS = 500;

/** Подписи наложений для подсказок у иконок приёмов врага. */
export const ENEMY_EFFECT_TITLE: Record<string, string> = {
  bleed: "Кровотечение",
  poison: "Яд",
  burn: "Горение",
  curse: "Проклятие",
  fear: "Страх",
  stun: "Оглушение: −1 ход",
  sunder: "Раскол брони",
  darkness: "Мрак",
  noHeal: "Запрет лечения",
  sealItems: "Печать немоты: рюкзак",
  sealSkills: "Печать забвения: приёмы",
  sealAttack: "Печать оков: атака",
};

/** Что эффект делает с героем: подсказка у иконки приёма врага. Описание совпадает с подсказками статусов. */
export const ENEMY_EFFECT_DESC: Record<string, string> = {
  bleed: "Рана не затягивается: кровь идёт каждый раунд.",
  poison: "Яд в крови разъедает изнутри каждый раунд.",
  burn: "Огонь держится на тебе и жжёт каждый раунд.",
  curse: "Твой урон снижен на силу проклятия.",
  fear: "В свой ход ты в защите: атаки и приёмы закрыты, рюкзак доступен.",
  stun: "Пропускаешь ходы: очередь короче на число ходов оглушения.",
  sunder: "Броня героя снижается: раскол — до конца боя, гниение ходока — на два раунда.",
  darkness: "Половина твоих атак уходит в пустоту.",
  noHeal: "Зелья и приёмы лечения не работают.",
  sealItems: "Припасы недоступны.",
  sealSkills: "Приёмы оружия недоступны.",
  sealAttack: "Обычная атака недоступна.",
};

/** Процент для строк сводки. */
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Иконка наложения приёма врага. Пунктир-«½» — наложение с шансом около половины. Подробности — в подсказке строки приёма. */
function EnemyEffectIcon({ effect }: { effect: EnemyMoveEffect }) {
  const color = (EFFECT_COLORS as Record<string, string>)[effect.id] ?? "#c9b58a";
  const name = ENEMY_EFFECT_TITLE[effect.id] ?? effect.id;
  return (
    <span
      className="relative flex h-6 w-6 shrink-0 items-center justify-center border"
      style={{ borderColor: color, color, background: "rgba(12,10,9,0.72)" }}
      aria-label={`${name}${effect.half ? " — примерно в половине попаданий" : ""}`}
    >
      <EffectGlyph id={effect.id as EffectIconId} size={15} />
      {effect.half && (
        <span className="absolute -bottom-1 -right-1 border border-line bg-soot px-0.5 font-mono text-[0.6rem] leading-[1.1] text-parch">
          ½
        </span>
      )}
    </span>
  );
}

/** Содержимое подсказки приёма врага: описание, расчёт урона по шагам, наложения с шансом и числами. */
export function EnemyMoveTip({ mv, meta }: { mv: EnemyMoveView; meta?: { name: string; desc: string } }) {
  const bd = mv.breakdown;
  const fmt = (v: number) => String(Math.round(v));
  return (
    <div className="text-[0.84rem] leading-snug text-parch/90">
      <div className="font-display text-[0.95rem] uppercase tracking-[0.06em] text-flamehi">{meta?.name ?? mv.move}</div>
      {meta?.desc && <p className="mt-1 text-mute">{meta.desc}</p>}
      {mv.cooldown > 0 && <p className="mt-1 text-mute">Перезарядка: ещё {mv.cooldown}. Приём сейчас недоступен.</p>}

      <div className="sc mt-2">Урон по тебе</div>
      {bd.lines.length === 0 ? (
        <p className="mt-1">Приём урона не наносит.</p>
      ) : (
        <>
          <ul className="mt-1 space-y-0.5">
            {bd.lines.map((ln, i) => (
              <li key={`${ln.label}${i}`} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {ln.label}
                  {ln.note && <span className="ml-1 text-mute">{ln.note}</span>}
                </span>
                <span className="shrink-0 font-mono tab">{fmt(ln.value)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Шанс попасть: <b className="font-mono">{pct(bd.hitChance)}</b>
            {bd.hitMisses.length > 0 && (
              <span className="text-mute"> ({bd.hitMisses.map((m) => `${m.label} −${pct(m.chance)}`).join(", ")})</span>
            )}
          </p>
          {bd.blocked && <p className="text-mute">Удар не пройдёт: {bd.blocked}.</p>}
          {bd.hits > 1 && <p className="text-mute">Два удара: второй приходит, только если первый попал.</p>}
          <p className="mt-1 flex justify-between gap-3 border-t border-line/50 pt-1">
            <span>Ожидаемый урон приёма</span>
            <span className="font-mono text-rubric">≈ {fmt(bd.expected)}</span>
          </p>
        </>
      )}

      <div className="sc mt-2">Наложения</div>
      {mv.details.length === 0 && <p className="mt-1">Наложений нет.</p>}
      {mv.details.map((d, i) => (
        <div key={`${d.id}${i}`} className="mt-1.5">
          <div className="flex justify-between gap-3">
            <span className="font-display uppercase tracking-[0.04em] text-parch">{ENEMY_EFFECT_TITLE[d.id] ?? d.id}</span>
            <span className="shrink-0 font-mono text-flamehi">{d.chance > 0 ? `шанс ${pct(d.chance)}` : "не сработает"}</span>
          </div>
          {ENEMY_EFFECT_DESC[d.id] && <p className="text-mute">{ENEMY_EFFECT_DESC[d.id]}</p>}
          {d.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      ))}
      {mv.notes.map((n) => (
        <p key={n} className="mt-1.5">{n}</p>
      ))}
    </div>
  );
}

/** Строка приёма врага. При наводке или фокусе показывает подсказку: расчёт урона и наложения с числами. */
function EnemyMoveRow({ mv, meta }: { mv: EnemyMoveView; meta?: { name: string; desc: string } }) {
  const [open, setOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  useFitInViewport(tipRef, open);
  return (
    <li
      tabIndex={0}
      className="relative flex items-center gap-2 py-1.5 outline-none focus-visible:ring-1 focus-visible:ring-flame"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        className={`min-w-0 flex-1 truncate font-display text-[0.9rem] uppercase tracking-[0.06em] ${
          mv.cooldown > 0 ? "text-mute" : "text-flamehi"
        }`}
      >
        {meta?.name ?? mv.move}
      </span>
      {mv.cooldown > 0 && <span className="shrink-0 font-mono text-[0.72rem] text-mute">перез. {mv.cooldown}</span>}
      <span className="w-14 shrink-0 text-right font-mono text-[1rem] tab text-rubric">
        {mv.damage > 0 ? `≈${mv.damage}` : "—"}
      </span>
      <span className="flex min-w-[2.5rem] shrink-0 justify-end gap-1">
        {mv.effects.map((ef, i) => (
          <EnemyEffectIcon key={`${ef.id}${ef.half ? "h" : ""}${i}`} effect={ef} />
        ))}
      </span>
      {open && (
        <div
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 block w-[min(26rem,80vw)] border border-line bg-black/95 p-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
        >
          <EnemyMoveTip mv={mv} meta={meta} />
        </div>
      )}
    </li>
  );
}

/** Тег с подсказкой: при наводке или фокусе показывает, что даёт род, тип, угроза или особенность. */
function InfoTag({
  label,
  title,
  lines,
  tone,
}: {
  label: string;
  title: string;
  lines: string[];
  tone: "mute" | "flame" | "verd" | "rubric";
}) {
  const [open, setOpen] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);
  useFitInViewport(tipRef, open);
  const items = lines.filter(Boolean);
  return (
    <span
      tabIndex={0}
      className="relative inline-flex outline-none focus-visible:ring-1 focus-visible:ring-flame"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <Tag tone={tone}>{label}</Tag>
      {open && items.length > 0 && (
        <span
          ref={tipRef} role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 block w-[min(19rem,72vw)] border border-flamedim bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
        >
          <span className="block font-display text-[0.92rem] uppercase tracking-[0.06em] text-flamehi">{title}</span>
          <ul className="mt-1.5 space-y-0.5 text-[0.84rem] leading-snug text-parch/90">
            {items.map((line) => (
              <li key={line} className="flex gap-1.5">
                <span className="shrink-0 text-flame">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}

export function BattleView({
  battle,
  onAct,
  onEnemyTurn,
  onStunSkip,
  onContinue,
}: {
  battle: BattleState;
  onAct: (a: PlayerAction) => void;
  onEnemyTurn: () => void;
  onStunSkip: () => void;
  onContinue: () => void;
}) {
  const [menu, setMenu] = useState<"main" | "skill" | "item">("main");
  const [codex, setCodex] = useState(false);
  /* Табы в сводках: характеристики или эффекты — отдельно для героя и монстра. */
  const [heroTab, setHeroTab] = useState<SummaryTab>("stats");
  const [foeTab, setFoeTab] = useState<SummaryTab>("stats");
  const b = battle;
  const myTurn = !b.over && b.queue[b.idx] === "p";
  const e = b.enemy;
  const earnedXp = b.loot.xp;

  useEffect(() => {
    if (b.over) return;
    if (b.queue[b.idx] !== "e") return;
    const t = window.setTimeout(onEnemyTurn, TURN_PAUSE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.idx, b.round, b.over]);

  /* Оглушённый герой не выбирает действие: ход пропускается сам через паузу. */
  useEffect(() => {
    if (b.over) return;
    if (b.queue[b.idx] !== "p" || b.p.statuses.stunAp <= 0) return;
    const t = window.setTimeout(onStunSkip, TURN_PAUSE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.idx, b.round, b.over, b.p.statuses.stunAp]);

  const act = (a: PlayerAction) => {
    setMenu("main");
    onAct(a);
  };

  const side = b.queue[b.idx];
  const ws = b.p.weaponSkill;
  const wsReq = ws ? Math.max(1, ws.intReq - b.p.intDiscount) : 0;
  const wsIntOk = ws ? b.p.stats.int >= wsReq : false;
  /* Страх: герой уже в защите, атаки, приёмы и бегство закрыты, рюкзак открыт. */
  const feared = b.p.statuses.fear > 0;
  /* Подсветка приёмов: светится только то, что можно применить прямо сейчас. */
  const ready = skillReadiness(b, myTurn, feared);

  /* Ведомость пересчитывается каждый рендер: эффекты сразу видны в числах */
  const r = combatReadout(b);
  /* Параметры врага для сводки и списка приёмов: те же функции, что и в бою. */
  const er = enemyReadout(b);
  const changed = (base: string, now: string) => base !== now;

  /* Иконки эффектов: у героя — под здоровьем, у монстра — поверх портрета. */
  const playerChips = playerEffectChips(b);
  const enemyChips = enemyEffectChips(b);
  /* Полный список для вкладок «Эффекты»: статусы, свойства вещей, способности и врождённые свойства монстра. */
  const heroEffects: TabEffect[] = [...chipEntries(playerChips), ...(b.p.itemEffects ?? []), ...learnedEffects(b.p.passives)];
  const foeEffects: TabEffect[] = [...chipEntries(enemyChips), ...enemyEffects(e)];
  const highlight = new Set(playerChips.map((c) => c.highlight).filter(Boolean));
  const highlightedRows: Record<string, boolean> = {
    "Урон оружием": highlight.has("dmg"),
    "Броня": highlight.has("armor"),
    "Входящий урон": highlight.has("armor"),
    "Выносливость": highlight.has("ap"),
    "Уклонение": highlight.has("evade"),
    "Критический удар": highlight.has("crit"),
  };

  /* Иконка и подсказка каждой строки сводки героя */
  const ROW_METRIC: Record<string, MetricKey> = {
    "Урон оружием": "damage",
    "По противнику": "enemyDamage",
    "Броня": "armor",
    "Входящий урон": "incomingDamage",
    "Выносливость": "stamina",
    "Уклонение": "evade",
    "Промах в мраке": "missChance",
    "Критический удар": "crit",
    "Стойкость": "resist",
    "Маг. сопротивление": "magicResist",
    "Укрепление": "fortify",
    "Характеристики": "stats",
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
          : (b.p.statuses.weakness ?? 0) > 0
          ? { text: `Слабость −${Math.round((b.p.statuses.weakness ?? 0) * WEAKNESS_STEP * 100)}% (${b.p.statuses.weakness} нал.)`, tone: "rubric" }
          : undefined,
      hint: `${b.p.weaponName} + ${statDamage(b.p.stats.str, b.p.passives)} от СИЛ`,
    },
    {
      label: "По противнику",
      base: `${r.dmgMin}–${r.dmgMax}`,
      now: `${r.effMin}–${r.effMax}`,
      badge: e.guard
        ? { text: "+25% Броня врага", tone: "rubric" }
        : e.passive?.id === "stone_hide"
        ? { text: "−25% Каменная шкура", tone: "rubric" }
        : undefined,
      hint: `после брони ${enemyArmorNow(e)}${e.guard ? " (в защите +25%)" : ""}${e.passive?.id === "stone_hide" ? " и каменной шкуры" : ""}`,
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
          ? { text: "+25% Броня · −30% Каменная кожа", tone: "verd" }
          : b.p.guard
          ? { text: "+25% Броня", tone: "verd" }
          : b.p.statuses.stone > 0
          ? { text: `−30% Каменная кожа (${b.p.statuses.stone} р.)`, tone: "verd" }
          : undefined,
      hint: `после брони ${r.armor}${b.p.guard ? " (в защите +25%)" : ""}`,
    },
    {
      label: "Выносливость",
      base: `${r.staminaMax}`,
      now: `${r.stamina}`,
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

  /* Сводка врага: только то, что важно в бою. Строки тех же видов, что у героя. */
  const enemyRows: (SummaryRowData & { base: string; now: string })[] = [
    {
      metric: "incomingDamage",
      label: "Урон по тебе",
      base: `${e.atk[0]}–${e.atk[1]}`,
      now: `${r.inMin}–${r.inMax}`,
      hint: `обычный удар врага после твоей брони ${r.armor}`,
    },
    {
      metric: "guard",
      label: "Защита",
      base: "—",
      now: er.guard ? "+25%" : "—",
      hint: "глухая защита врага: броня +25%, пока он в обороне",
    },
    {
      metric: "evade",
      label: "Уклонение",
      base: pct(er.evade),
      now: pct(er.evade),
      hint: "шанс полностью уйти от твоего удара: тип и род",
    },
    {
      metric: "armor",
      label: "Броня",
      base: `${er.armorBase}`,
      now: `${er.armor}`,
      hint: "вычитается из твоего физического урона",
    },
    {
      metric: "resist",
      label: "Стойкость",
      base: pct(er.resist),
      now: pct(er.resist),
      hint: "шанс, что негативный эффект на него не ляжет: род, босс, снаряжение",
    },
    {
      metric: "fortify",
      label: "Укрепление",
      base: pct(er.fortify),
      now: pct(er.fortify),
      hint: "срез физического урона по нему",
    },
    {
      metric: "magicResist",
      label: "Маг. сопротивление",
      base: pct(er.magicResist),
      now: pct(er.magicResist),
      hint: "срез магического урона по нему",
    },
    {
      metric: "ap",
      label: "Ходов в раунде",
      base: `${er.ap}`,
      now: `${er.ap}`,
      hint: "у кого больше — тот всегда раньше",
    },
    /* Характеристики врага: та же шкала, что у героя; подсказка показывает, что каждая даёт. */
    {
      metric: "stats",
      label: "Характеристики",
      base: `${er.stats.str}/${er.stats.agi}/${er.stats.int}`,
      now: `${er.stats.str}/${er.stats.agi}/${er.stats.int}`,
      hint: `СИЛ: +${monsterHealthBonus(er.stats.str)} ОЗ, +${monsterDamageBonus(er.stats.str)} к удару · ЛОВ: +${monsterActionsBonus(er.stats.agi)} хода, +${Math.round(monsterEvasionBonus(er.stats.agi) * 100)}% уклонения · ИНТ: +${monsterTechniqueBonus(er.stats.int)} к урону приёмов`,
    },
  ];

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
              выносливость: <b className="text-flame">{b.p.stamina}/{b.p.staminaMax}</b>
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

      <div className="grid flex-1 items-start xl:grid-cols-3">
        {/* ГЕРОЙ — левая колонка боя: здоровье, концентрация, эффекты и сводка */}
        <div className="order-2 min-w-0 border-b border-line p-4 sm:p-6 xl:order-1 xl:col-start-1 xl:border-b-0">
          {/* ГЕРОЙ: здоровье, концентрация, эффекты и сводка боя */}
          <div className="relative border border-line bg-slab/80 p-4">
            <div>
              <h3 className="font-display text-lg uppercase tracking-[0.14em] text-flamehi">Покоритель</h3>
              <span className="font-mono text-[0.84rem] text-mute">
                оружие: <b className="text-parch">{b.p.weaponName}</b>
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
              <span className="sc text-rubric">Здоровье</span>
              <Meter value={b.p.hp} max={b.p.maxHp} tone="rubric" />
              <span className="font-mono text-sm tab text-parch">{b.p.hp}/{b.p.maxHp}</span>
              <span className="sc text-flamedim">Выносливость</span>
              <Meter value={b.p.stamina} max={b.p.staminaMax} tone="flame" />
              <span className="font-mono text-sm tab text-parch">{b.p.stamina}/{b.p.staminaMax}</span>
            </div>

            {/* Наложенные эффекты героя — сразу под здоровьем */}
            {playerChips.length > 0 && (
              <div className="relative z-20 mt-2">
                <EffectChips chips={playerChips} label="эффекты героя" />
              </div>
            )}

            {/* Концентрация: атака +1, приём −1, расходник +1, защита +2; при 5 открывается спец-приём */}
            <div
              className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-3"
              title="Атака +1, приём −1, расходник +1, защита +2. При 5 открывается спец-приём архетипа и концентрация тратится целиком."
            >
              <span className="sc text-flamedim">Концентрация</span>
              <div className="flex gap-1" role="meter" aria-valuemin={0} aria-valuemax={MAX_CONCENTRATION} aria-valuenow={b.p.concentration} aria-label="Концентрация">
                {Array.from({ length: MAX_CONCENTRATION }, (_, i) => (
                  <span key={i} className={`h-2 flex-1 ${i < b.p.concentration ? "bg-flame" : "bg-black/50"}`} />
                ))}
              </div>
              <span className="font-mono text-sm tab text-parch">{b.p.concentration}/{MAX_CONCENTRATION}</span>
            </div>

            <div className="mt-3 border-t border-line/70 pt-3">
              <span className="sc">Сводка боя</span>
              <div className="mt-2">
                <SummaryTabs value={heroTab} onChange={setHeroTab} effectsCount={heroEffects.length} />
              </div>
              {heroTab === "stats" ? (
                <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[0.94rem] sm:grid-cols-3">
                  {rows.map((row, i) => (
                    <SummaryRow
                      key={row.label}
                      row={{ ...row, metric: ROW_METRIC[row.label], boon: highlightedRows[row.label] }}
                      live={changed(row.base, row.now)}
                      align={i % 2 === 1 ? "right" : "left"}
                    />
                  ))}
                </div>
              ) : (
                <EffectsTab entries={heroEffects} label="эффекты героя" />
              )}
            </div>

            {b.flash && b.flash.target === "p" && (
              <span key={b.flash.id} className="hitflash pointer-events-none mt-1 block font-mono text-lg text-rubric">
                {b.flash.kind === "heal" ? `+${b.flash.amount}` : b.flash.kind === "miss" ? "мимо" : `−${b.flash.amount}`}
              </span>
            )}
          </div>

        </div>

        {/* ДЕЙСТВИЯ — центральная колонка боя: кнопки, приёмы, рюкзак */}
        <div className="order-3 min-w-0 border-b border-line p-4 sm:p-6 xl:order-2 xl:col-start-2 xl:border-b-0">
          {/* ДЕЙСТВИЯ */}
          <div className="border border-line bg-slab/95 p-4">
            <h3 className="sc mb-3 text-flamedim">Действия</h3>
            {!b.over && !myTurn && (
              <div className="mb-3 h-2 w-full overflow-hidden bg-black/50">
                <div className="h-full w-1/3 animate-pulse bg-rubric/60" />
              </div>
            )}

            {(feared || b.p.statuses.sealAttack > 0 || b.p.statuses.sealSkills > 0 || b.p.statuses.sealItems > 0) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {feared && <Tag tone="rubric">Страх: рюкзак, защита, побег, конец хода</Tag>}
                {b.p.statuses.sealAttack > 0 && <Tag tone="rubric">Печать оков: удар запрещён</Tag>}
                {b.p.statuses.sealSkills > 0 && <Tag tone="rubric">Печать забвения: приёмы запрещены</Tag>}
                {b.p.statuses.sealItems > 0 && <Tag tone="rubric">Печать немоты: расходники запрещены</Tag>}
              </div>
            )}
            {(menu === "main" || menu === "item") && (
              <div className="grid grid-cols-3 gap-2">
                {ATTACK_KINDS.map((kind) => {
                  const meta = ATTACK_KIND_META[kind];
                  const preview = heroAttackPreview(b, kind);
                  return (
                    <Btn
                      key={kind}
                      tone={!ready.attack ? "ghost" : kind === "safe" ? "verd" : "flame"}
                      disabled={!ready.attack}
                      title={`${meta.desc} Шанс попасть: ${Math.round(preview.chance * 100)}%${
                        preview.state === "advantage" ? " (преимущество: два броска, лучший)" : preview.state === "disadvantage" ? " (помеха: два броска, худший)" : ""
                      }`}
                      onClick={() => act({ type: "attack", kind })}
                    >
                      <span className="block">{meta.name} · {attackStaminaCost(b)}</span>
                      <span className="block text-[0.72rem] opacity-80">попасть {Math.round(preview.chance * 100)}%</span>
                    </Btn>
                  );
                })}
              </div>
            )}
            {(menu === "main" || menu === "item") && (
              <div className={b.p.archetype ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
                <Btn tone={ready.skills ? "flame" : "ghost"} disabled={!myTurn || feared || b.p.statuses.sealSkills > 0 || b.p.stamina < techniqueStaminaCost(b)} onClick={() => setMenu("skill")}>
                  Приёмы · {techniqueStaminaCost(b)}
                </Btn>
                {b.p.archetype && (
                  <Btn
                    tone={ready.special ? "flame" : "ghost"}
                    disabled={!ready.special}
                    title={ARCHETYPES[b.p.archetype].special.desc}
                    onClick={() => act({ type: "archetype_skill" })}
                  >
                    Спец-приём: {ARCHETYPES[b.p.archetype].special.name} · {b.p.concentration}/{MAX_CONCENTRATION}
                  </Btn>
                )}
              </div>
            )}
            {(menu === "main" || menu === "item") && b.p.archetype && (
              <p className="mb-2 mt-1 text-[0.85rem] leading-snug text-mute">{ARCHETYPES[b.p.archetype].special.desc}</p>
            )}
            {(menu === "main" || menu === "item") && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Btn disabled={!myTurn || b.p.statuses.sealItems > 0} onClick={() => setMenu("item")}>
                  Рюкзак · {STAMINA_BACKPACK}
                </Btn>
                <Btn tone="verd" disabled={!myTurn || b.p.stamina < STAMINA_GUARD} onClick={() => act({ type: "guard" })}>
                  Защита · {STAMINA_GUARD}
                </Btn>
                <Btn className="w-full" disabled={!myTurn} onClick={() => act({ type: "end_turn" })}>
                  Пропуск хода
                </Btn>
              </div>
            )}
            {(menu === "main" || menu === "item") && (
              <div className="mt-2">
                <Btn className="w-full" tone="danger" disabled={!myTurn} onClick={() => act({ type: "flee" })}>
                  Сбежать
                </Btn>
              </div>
            )}

            {/* СУМКА: три слота зелий прямо в действиях. Зелье из сумки не тратит выносливость. */}
            {(menu === "main" || menu === "item") && (
              <div className="mt-3 border-t border-line/70 pt-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="sc text-flamedim">Сумка</span>
                  <span className="font-mono text-[0.78rem] text-mute">
                    зелья без выносливости
                  </span>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: POUCH_SLOTS }, (_, i) => b.pouch[i] ?? null).map((id, i) => {
                    if (!id) {
                      return (
                        <div key={`empty-${i}`} className="border border-dashed border-line/70 px-3 py-2 text-[0.85rem] italic text-mute">
                          Слот {i + 1} пуст: зелье ставится в сумку вне боя.
                        </div>
                      );
                    }
                    const def = ITEMS[id];
                    const n = b.bag[id] ?? 0;
                    const req = def ? consumableIntReq(def, b.p.intDiscount) : 0;
                    const intOk = b.p.stats.int >= req;
                    const fearImmune = def?.use?.type === "fear" && isImmuneTo(e.def.race, "fear");
                    const ok = !!def && n > 0 && intOk && myTurn && !fearImmune && b.p.statuses.sealItems < 1;
                    const pv = consumablePreview(b, id);
                    const freeUse = true;
                    return (
                      <button
                        key={id}
                        disabled={!ok}
                        onClick={() => act({ type: "item", id })}
                        className="flex w-full items-center justify-between gap-3 border border-line bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-40"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ItemArt id={id} name={def?.name ?? id} size={30} framed={false} />
                          <span className="min-w-0">
                            <span className="block truncate font-display text-[0.98rem] uppercase tracking-[0.1em] text-flamehi">
                              {def?.name ?? id} <span className="font-mono text-[0.82rem] text-flame">×{n}</span>
                            </span>
                            {(pv.damage !== null || pv.heal !== null) && (
                              <span className="block font-mono text-[0.82rem] text-verd">
                                {pv.damage !== null ? `урон ${pv.damage}` : `+${pv.heal} здоровья`}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className={`shrink-0 font-mono text-[0.8rem] ${ok ? "text-verd" : "text-rubric"}`}>
                          {n < 1
                            ? "нет в рюкзаке"
                            : fearImmune
                              ? "иммунитет"
                              : !intOk
                                ? `нужен ИНТ ${req}`
                                : !myTurn
                                  ? "не твой ход"
                                  : freeUse
                                    ? "без выносливости"
                                    : `тратит ${STAMINA_BACKPACK} выносливости`}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
                <p className={`text-sm ${b.p.concentration < 1 ? "text-rubric" : "text-mute"}`}>
                  Каждый приём тратит 1 концентрации. Сейчас: {b.p.concentration}/{MAX_CONCENTRATION}
                  {b.p.concentration < 1 ? " — приёмы недоступны, пока не накопится концентрация." : "."}
                </p>
                <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                  {ws ? (
                    <button
                      disabled={!myTurn || !wsIntOk || b.p.weaponCd > 0 || b.p.concentration < 1 || b.p.stamina < techniqueStaminaCost(b)}
                      onClick={() => act({ type: "weapon_skill" })}
                      className="flex items-center justify-between gap-3 border border-line bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-45"
                    >
                      <span>
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-display text-[1.02rem] uppercase tracking-[0.1em] text-flamehi">{ws.name}</span>
                          {r.techMin !== null && r.techMax !== null && (
                            <span
                              className="font-mono text-[1rem] tab text-verd"
                              title="Урон этого приёма по текущему противнику: с учётом его брони и защиты, твоих эффектов и бонуса приёма"
                            >
                              урон {r.techMin}–{r.techMax}
                            </span>
                          )}
                          <span className="font-mono text-[0.82rem] text-mute">({b.p.weaponName})</span>
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
                        disabled={!myTurn || !intOk || cd > 0 || b.p.concentration < 1 || b.p.stamina < techniqueStaminaCost(b)}
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

                  {b.p.armorSkills.map((sk) => {
                    const req = sk.intReq <= 0 ? 0 : Math.max(1, sk.intReq - (sk.scaleStat === "int" ? b.p.intDiscount : 0));
                    const statOk = req === 0 || b.p.stats[sk.scaleStat] >= req;
                    const cd = b.p.armorCds[sk.id] ?? 0;
                    return (
                      <button
                        key={sk.id}
                        disabled={!myTurn || !statOk || cd > 0 || b.p.statuses.sealSkills > 0 || b.p.concentration < 1 || b.p.stamina < actionStaminaCost(b, { type: "armor_skill", id: sk.id })}
                        onClick={() => act({ type: "armor_skill", id: sk.id })}
                        className="flex items-center justify-between gap-3 border border-flamedim/70 bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-45"
                      >
                        <span>
                          <span className="block font-display text-[1.02rem] uppercase tracking-[0.1em] text-flame">
                            [Броня · {sk.kind === "attack" ? "атака" : "защита"}] {sk.name}
                          </span>
                          <span className="block text-[0.89rem] leading-snug text-mute">{armorSkillDesc(sk)}</span>
                        </span>
                        <span className={`shrink-0 font-mono text-[0.84rem] ${!statOk ? "text-rubric" : cd > 0 ? "text-mute" : "text-verd"}`}>
                          {!statOk ? `нужен ${STAT_META[sk.scaleStat].short} ${req}` : cd > 0 ? `перезар. ${cd} р.` : "готово"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ПРОТИВНИК И ХРОНИКА — правая колонка */}
        {/* ПРОТИВНИК — правая колонка боя: занимает свою треть экрана */}
        <div className="order-1 min-w-0 xl:order-3 xl:col-start-3 xl:border-l xl:border-line">
          <div className="relative flex flex-col border-line bg-black/30">
            {/* Эффекты монстра — поверх портрета в левом верхнем углу. */}
            {enemyChips.length > 0 && (
              <div className="absolute left-3 top-3 z-30 max-w-[76%]">
                <EffectChips chips={enemyChips} size={34} label="эффекты врага" />
              </div>
            )}
            <div className="relative aspect-[5/4] w-full border-b border-line bg-soot">
              <div className="absolute inset-0 overflow-hidden">
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
              </div>
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
                {e.def.title && <div className="sc mb-1 text-rubric">{e.def.title}</div>}
                {/* Род и тип — над именем; подсказка по наведению */}
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  <InfoTag
                    tone="verd"
                    label={MONSTER_RACE_META[e.def.race].name}
                    title={`Род: ${MONSTER_RACE_META[e.def.race].name}`}
                    lines={[MONSTER_RACE_META[e.def.race].note, ...raceTraits(e.def.race, e.mtype)]}
                  />
                  <InfoTag
                    tone="flame"
                    label={MONSTER_TYPE_META[e.mtype].name}
                    title={`Тип: ${MONSTER_TYPE_META[e.mtype].name}`}
                    lines={[MONSTER_TYPE_META[e.mtype].note]}
                  />
                  {!b.isBoss && (
                    <InfoTag
                      tone={e.threat === "catastrophe" ? "rubric" : e.threat === "horror" ? "flame" : "verd"}
                      label={THREAT_META[e.threat].name}
                      title={`Угроза: ${THREAT_META[e.threat].name}`}
                      lines={[THREAT_META[e.threat].desc]}
                    />
                  )}
                  {e.passive && (
                    <InfoTag tone="rubric" label={e.passive.name} title="Пассивная способность" lines={[e.passive.desc]} />
                  )}
                </div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">{e.def.name}</h3>
                  <span className="font-mono text-sm tab text-parch">{e.hp}/{e.maxHp}</span>
                </div>
                <Meter value={e.hp} max={e.maxHp} tone="rubric" />
              </div>
            </div>

            {/* Сводка врага: характеристики и эффекты в табах */}
            <div className="border-b border-line bg-slab/80 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="sc">Сводка врага</span>
                {e.forceGuard > 0 && <Tag tone="verd">вынужден держать оборону</Tag>}
              </div>
              <div className="mt-2">
                <SummaryTabs value={foeTab} onChange={setFoeTab} effectsCount={foeEffects.length} />
              </div>
              {foeTab === "stats" ? (
                <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[0.94rem] sm:grid-cols-3">
                  {enemyRows.map((row, i) => (
                    <SummaryRow
                      key={row.label}
                      row={row}
                      live={changed(row.base, row.now)}
                      align={i % 2 === 1 ? "right" : "left"}
                    />
                  ))}
                </div>
              ) : (
                <EffectsTab entries={foeEffects} label="эффекты врага" />
              )}
            </div>

            {/* Приёмы врага: сколько нанесёт и какие наложит */}
            <div className="border-b border-line bg-black/25 px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="sc">Приёмы врага</span>
                <span className="font-mono text-[0.76rem] text-mute" title="Ожидаемый урон по тебе после твоей брони и защит">≈ урон по тебе</span>
              </div>
              <ul className="mt-1.5 divide-y divide-line/40">
                {er.moves.map((mv) => (
                  <EnemyMoveRow key={mv.move} mv={mv} meta={ENEMY_MOVE_META[mv.move]} />
                ))}
              </ul>
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
                    {l.dmg && <DamageTypeTag id={l.dmg} size={12} className="mr-1.5" />}
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── РЮКЗАК: на всю высоту экрана, слева ── */}
      {menu === "item" && (
        <div className="fixed inset-0 z-40 flex justify-start">
          <button className="absolute inset-0 bg-black/70" onClick={() => setMenu("main")} aria-label="Закрыть рюкзак" />
          <aside className="rise relative flex h-full w-[min(30rem,100vw)] flex-col border-r-2 border-flamedim bg-slab shadow-[30px_0_60px_-30px_#000]">
            <header className="flex items-start justify-between gap-3 border-b border-line bg-slab2/95 px-4 py-3">
              <div>
                <span className="sc text-flamedim">Рюкзак</span>
                <h3 className="font-display text-xl uppercase tracking-[0.1em] text-flamehi">Свитки и зелья</h3>
                <p className="font-mono text-[0.84rem] text-mute">
                  {feared ? "страх: рюкзак открыт" : myTurn ? `твой ход: расходник тратит ${STAMINA_BACKPACK} выносливости` : "ход врага или ожидание"}
                </p>
              </div>
              <button onClick={() => setMenu("main")} className="mt-1 text-mute hover:text-rubric" aria-label="Закрыть рюкзак">
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {Object.entries(b.bag).filter(([id]) => ITEMS[id]?.use && (ITEMS[id]?.kind !== "special" || ITEMS[id]?.use?.type === "special_water") && ITEMS[id]?.kind !== "reagent").length === 0 && (
                <p className="text-sm italic text-mute">Рюкзак пуст: зелья, свитки и метательное оружие продаются в магазине.</p>
              )}
              {Object.entries(b.bag).filter(([id]) => ITEMS[id]?.use && (ITEMS[id]?.kind !== "special" || ITEMS[id]?.use?.type === "special_water") && ITEMS[id]?.kind !== "reagent").map(([id, n]) => {
                const def = ITEMS[id];
                const u = def.use!;
                const req = consumableIntReq(def, b.p.intDiscount);
                const intOk = b.p.stats.int >= req;
                const fearImmune = u.type === "fear" && isImmuneTo(e.def.race, "fear");
                const poisonImmune = u.type === "poison" && isImmuneTo(e.def.race, "poison");
                const ok = intOk && myTurn && !fearImmune && (b.pouch.includes(id) || b.p.stamina >= STAMINA_BACKPACK);
                const dmgType = itemDamageType(def.use);
                const pv = consumablePreview(b, id);
                return (
                  <button
                    key={id}
                    disabled={!ok}
                    onClick={() => act({ type: "item", id })}
                    className="flex w-full items-center justify-between gap-3 border border-line bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-40"
                  >
                    <span className="flex items-start gap-2">
                      <ItemArt id={id} name={def.name} size={34} framed={false} className="mt-0.5" />
                      <span>
                        <span className="block font-display text-[1.02rem] uppercase tracking-[0.1em] text-flamehi">
                          {def.name} <span className="font-mono text-[0.84rem] text-flame">×{n}</span>
                          {dmgType && <DamageTypeTag id={dmgType} size={14} className="ml-2" />}
                          {def.kind === "potion" && b.pouch.includes(id) && (
                            <span className="ml-2 font-mono text-[0.78rem] text-verd">из сумки · без выносливости</span>
                          )}
                        </span>
                        <span className="block text-[0.89rem] leading-snug text-mute">{def.desc}</span>
                        {(pv.damage !== null || pv.heal !== null || pv.effects.length > 0) && (
                          <span className="mt-1 block space-y-0.5 text-[0.85rem] leading-snug">
                            {pv.damage !== null && (
                              <span className="block font-mono text-verd" title="Урон по этому противнику с учётом его защиты">
                                урон {pv.damage}
                              </span>
                            )}
                            {pv.heal !== null && <span className="block font-mono text-verd">+{pv.heal} здоровья</span>}
                            {pv.effects.map((line) => (
                              <span key={line} className="block text-parch">{line}</span>
                            ))}
                          </span>
                        )}
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
                                ? `${consumableScaleLabel(def).replace(" + ", "+")} · готово`
                                : "готово"
                            : `нужен ИНТ ${req}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

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
                        {ENEMY_COOLDOWN_MOVES.includes(mv) && (() => {
                          const left = enemyMoveCooldownLeft(b, mv);
                          return (
                            <div className="mt-0.5 font-mono text-[0.8rem] text-rubric/85">
                              {left > 0
                                ? `приёмы с дебаффами на перезарядке: ещё ${left} ${left === 1 ? "раунд" : "раунда"}`
                                : `общая перезарядка ${ENEMY_MOVE_COOLDOWN} раунда после любого такого приёма`}
                            </div>
                          );
                        })()}
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
                    Броня <b className="text-parch">{enemyArmorNow(e)}</b> — вычитается из физических ударов;{" "}
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
                  {raceTraits(e.def.race, e.mtype).map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                  {(() => {
                    const rows = raceElementRows(e.def.race);
                    return (
                      <>
                        {rows.weak.length > 0 && <li><ElementRow label="• уязвим к:" elements={rows.weak} /></li>}
                        {rows.immune.length > 0 && <li><ElementRow label="• иммунен к:" elements={rows.immune} /></li>}
                      </>
                    );
                  })()}
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

export type SummaryTab = "stats" | "effects";

/** Два таба сводки: «Характеристики» и «Эффекты». Активный помечен aria-selected. */
export function SummaryTabs({
  value,
  onChange,
  effectsCount,
}: {
  value: SummaryTab;
  onChange: (tab: SummaryTab) => void;
  effectsCount: number;
}) {
  const tabs: { id: SummaryTab; label: string; count?: number }[] = [
    { id: "stats", label: "Характеристики" },
    { id: "effects", label: "Эффекты", count: effectsCount },
  ];
  return (
    <div role="tablist" className="flex gap-1.5">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`sc border px-2.5 py-1 text-[0.8rem] transition-colors ${
              on ? "border-flame bg-flame/15 text-flamehi" : "border-line text-mute hover:text-parch"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 font-mono text-[0.72rem] text-flame">{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Статусы как строки вкладки: название со стаками, что делает, срок или иммунитет. */
export function chipEntries(chips: EffectChip[]): TabEffect[] {
  return chips.map((c, i) => ({
    id: `chip-${i}-${c.id}`,
    name: c.badge && !c.name.includes(c.badge) ? `${c.name} ${c.badge}` : c.name,
    detail: c.details[0] ?? "",
    meta: c.immune ? "иммунитет" : durationLabel(c),
    negative: c.polarity === "bad",
  }));
}

/** Вкладка «Эффекты»: иконки статусов сверху и полный список всех эффектов. */
export function EffectsTab({ entries }: { entries: TabEffect[]; label?: string }) {
  if (entries.length === 0) return <p className="mt-2 text-sm italic text-mute">Эффектов нет.</p>;
  return (
    <div className="mt-2">
      <ul className="space-y-1.5">
        {entries.map((en) => (
          <li key={en.id} className="border-l-2 border-line/70 pl-2">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`min-w-0 truncate font-display text-[0.92rem] uppercase tracking-[0.05em] ${
                  en.negative ? "text-rubric" : "text-flamehi"
                }`}
              >
                {en.name}
              </span>
              {en.meta && <span className="shrink-0 font-mono text-[0.74rem] text-mute">{en.meta}</span>}
            </div>
            {en.detail && <p className="text-[0.86rem] leading-snug text-parch/85">{en.detail}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
