/**
 * Иконки и подсказки боевых эффектов.
 *
 * Один источник правды для того, что висит на герое и на монстре:
 * - полярность (усиление или дебафф) — от неё зависит рамка иконки;
 * - срок в раундах, ходах или зарядах;
 * - что именно эффект меняет в числах боя;
 * - периодический урон: за тик, сколько тиков осталось и сколько выйдет всего.
 *
 * Данные только читают состояние боя, ничего в нём не меняют.
 */
import type { BattleState } from "./battle";
import { combatChance } from "./chances";
import { enemyChance } from "./enemyEffects";
import { fireBurnDamage } from "./biomes";
import { MONSTER_RACE_META, raceCannotHeal, raceImmuneTo } from "./monsters";
import { CHILL_HEAL_MULT, magicTickDamage, statusTickDamage } from "./statusEffects";
import { isBattleCurse } from "./traps";

/* ─────────────────────────────  ИКОНКИ  ───────────────────────────── */

export const EFFECT_ICON_IDS = [
  "bleed", "poison", "burn", "chill", "curse", "wither", "blight", "fear",
  "sunder", "stun", "rage", "haste", "stone", "iron", "blood", "quickblade",
  "pact", "fullGuard", "tempArmor", "dodge", "smoke", "shadow", "darkness",
  "noHeal", "sealItems", "sealSkills", "sealAttack", "guard", "fury",
  "depleted", "regen", "thorns", "unknown",
] as const;

export type EffectIconId = (typeof EFFECT_ICON_IDS)[number];

/* ─────────────────────────────  ЦВЕТА  ───────────────────────────── */

/** Цвета рамок. Положительные всегда синие, дебаффы — по своей природе. */
export const EFFECT_COLORS = {
  buff: "#5b8dd6",
  immunity: "#7fa3c9",
  bleed: "#b3383f",
  poison: "#6d9b3a",
  burn: "#d97427",
  chill: "#5aa7c8",
  curse: "#8b5fbf",
  wither: "#8a8560",
  blight: "#7a8f3a",
  fear: "#a2762f",
  sunder: "#9a8b6a",
  stun: "#c9a227",
  darkness: "#6f6f8a",
  depleted: "#8c7b5a",
  plain: "#8a8a8a",
} as const;

/* ─────────────────────────────  ТИПЫ  ───────────────────────────── */

export type EffectPolarity = "good" | "bad";

/** Периодический урон эффекта. */
export interface EffectDot {
  /** Урон за один тик (округлённый, как в бою). */
  perTick: number;
  /** Сколько тиков ещё будет; null — срок не ограничен или растёт. */
  ticks: number | null;
  /** Итого за оставшийся срок; null — если тиков не счесть. */
  total: number | null;
  /** Тип урона: от него зависит, режет ли его сопротивление магии. */
  type: "физический" | "магический" | "огонь";
  /** Когда именно приходит урон. */
  when: string;
}

/** Временно усиленная характеристика — подсвечивается в интерфейсе. */
export interface EffectBoost {
  stat: string;
  value: string;
}

/** Строка сводки, которую нужно подсветить. */
export type EffectHighlight = "dmg" | "armor" | "ap" | "evade" | "crit" | "resist";

export interface EffectChip {
  /** Иконка. */
  id: EffectIconId;
  name: string;
  polarity: EffectPolarity;
  /** Иммунитет: рамка со щитом, эффект не наложится. */
  immune?: boolean;
  /** Осталось раундов; null — до конца боя, постоянно или по зарядам. */
  rounds: number | null;
  /** Единица срока, если это не раунды. */
  unit?: string;
  /** Короткая подпись на иконке: ×3, 2 и т. п. */
  badge?: string;
  /** Что делает эффект — строки для подсказки. */
  details: string[];
  /** Усиленные характеристики. */
  boosts: EffectBoost[];
  dot?: EffectDot;
  highlight?: EffectHighlight;
  /** Цвет рамки. */
  color: string;
}

/* ─────────────────────────────  ПОМОЩНИКИ  ───────────────────────────── */

const pct = (n: number): string => `${Math.round(n * 100)}%`;

/** Периодический урон от максимального ОЗ цели. */
function tickDot(
  kind: "bleed" | "poison" | "burn" | "chill" | "curse" | "blight",
  maxHp: number,
  rounds: number,
  magicResist = 0,
): EffectDot {
  const magic = kind === "chill" || kind === "curse";
  const perTick = magic
    ? magicTickDamage(maxHp, kind, magicResist)
    : statusTickDamage(maxHp, kind);
  return {
    perTick,
    ticks: rounds,
    total: perTick * rounds,
    type: magic ? "магический" : "физический",
    when: "в конце раунда",
  };
}

/** Строка «сколько это в числах» для подсказки. */
export function dotSummary(dot: EffectDot): string {
  const head = `${dot.perTick} ОЗ ${dot.type === "магический" ? "магического " : ""}урона ${dot.when}`;
  if (dot.ticks == null || dot.total == null) return `${head}; срок не ограничен`;
  const ticks = dot.ticks === 1 ? "1 тик" : `${dot.ticks} тика`;
  return `${head}; осталось ${ticks} → всего ${dot.total} ОЗ`;
}

/** Срок словами: «3 раунда», «до конца боя», «1 удар». */
export function durationLabel(chip: EffectChip): string {
  if (chip.rounds == null) return chip.unit ?? "до конца боя";
  const n = chip.rounds;
  if (chip.unit === "удар") return n === 1 ? "следующий удар" : `${n} удара`;
  if (chip.unit === "укрытие") return n === 1 ? "1 укрытие" : `${n} укрытия`;
  if (chip.unit === "ход") return n === 1 ? "1 ход" : `${n} хода`;
  if (n === 1) return "1 раунд";
  if (n >= 2 && n <= 4) return `${n} раунда`;
  return `${n} раундов`;
}

/* ─────────────────────────────  ГЕРОЙ  ───────────────────────────── */

/** Все эффекты на герое: усиления, дебаффы и иммунитеты. */
export function playerEffectChips(b: BattleState): EffectChip[] {
  const s = b.p.statuses;
  const chips: EffectChip[] = [];
  const magicRes = combatChance(b.p.chanceLayers.magicResist);
  const missing = Math.max(0, 1 - b.p.hp / Math.max(1, b.p.maxHp));
  const rageBonus = 0.1 * Math.min(10, Math.floor(missing * 10));

  /* ── Усиления ── */
  if (s.rage > 0) {
    chips.push({
      id: "rage", name: "Ярость", polarity: "good", rounds: s.rage,
      details: ["Урон растёт от недостающего здоровья: +10% за каждые 10%."],
      boosts: [{ stat: "Урон", value: `+${pct(rageBonus)}` }],
      highlight: "dmg", color: EFFECT_COLORS.buff,
    });
  }
  if (s.haste > 0) {
    chips.push({
      id: "haste", name: "Скорость", polarity: "good", rounds: s.haste,
      details: ["Ты действуешь на один ход раньше в каждом раунде."],
      boosts: [{ stat: "Ходы", value: "+1" }],
      highlight: "ap", color: EFFECT_COLORS.buff,
    });
  }
  if (s.stone > 0) {
    chips.push({
      id: "stone", name: "Каменная кожа", polarity: "good", rounds: s.stone,
      details: ["Входящий урон снижен на 30%."],
      boosts: [{ stat: "Защита", value: "−30% урона" }],
      highlight: "armor", color: EFFECT_COLORS.buff,
    });
  }
  if (s.ironTonic > 0) {
    chips.push({
      id: "iron", name: "Тоник железной кожи", polarity: "good", rounds: s.ironTonic,
      details: ["+4 брони и +4 регенерации за раунд."],
      boosts: [{ stat: "Броня", value: "+4" }],
      highlight: "armor", color: EFFECT_COLORS.buff,
    });
  }
  if (s.tempArmor > 0) {
    chips.push({
      id: "tempArmor", name: "Временная броня", polarity: "good", rounds: null,
      unit: "до конца боя",
      details: [`Броня усилена на ${s.tempArmor}: столько снимается с каждого физического удара.`],
      boosts: [{ stat: "Броня", value: `+${s.tempArmor}` }],
      highlight: "armor", color: EFFECT_COLORS.buff,
    });
  }
  if (s.fullGuard > 0) {
    chips.push({
      id: "fullGuard", name: "Полная защита", polarity: "good", rounds: s.fullGuard,
      details: ["Урон не проходит вовсе: удары гасятся целиком."],
      boosts: [{ stat: "Урон по тебе", value: "0" }],
      highlight: "armor", color: EFFECT_COLORS.buff,
    });
  }
  if (s.dodgeNext > 0) {
    chips.push({
      id: "dodge", name: "Пустой шаг", polarity: "good", rounds: s.dodgeNext, unit: "удар",
      details: ["Следующая атака по тебе промахнётся целиком и подарит лишний ход."],
      boosts: [{ stat: "Уклонение", value: "100%" }],
      highlight: "evade", color: EFFECT_COLORS.buff,
    });
  }
  if (s.smoke > 0) {
    chips.push({
      id: "smoke", name: "Дымовая завеса", polarity: "good", rounds: s.smoke, unit: "укрытие",
      details: ["Каждое укрытие отменяет одну атаку по тебе."],
      boosts: [{ stat: "Уклонение", value: `${s.smoke} атаки` }],
      highlight: "evade", color: EFFECT_COLORS.buff,
    });
  }
  if (s.shadowStep > 0) {
    chips.push({
      id: "shadow", name: "Теневой шаг", polarity: "good", rounds: s.shadowStep, unit: "ход",
      details: ["В следующем раунде у тебя дополнительные ходы."],
      boosts: [{ stat: "Ходы", value: `+${s.shadowStep}` }],
      highlight: "ap", color: EFFECT_COLORS.buff,
    });
  }
  if (s.quickblade > 0) {
    chips.push({
      id: "quickblade", name: "Масло быстрого клинка", polarity: "good", rounds: s.quickblade,
      details: ["+25% шанса крита и +50% силы крита."],
      boosts: [{ stat: "Крит", value: "+25%" }],
      highlight: "crit", color: EFFECT_COLORS.buff,
    });
  }
  if (s.bloodRage > 0) {
    chips.push({
      id: "blood", name: "Кровавая ярость", polarity: "good", rounds: s.bloodRage,
      details: ["Ярость от недостающего здоровья и +15% вампиризма оружием."],
      boosts: [{ stat: "Вампиризм", value: "+15%" }],
      highlight: "dmg", color: EFFECT_COLORS.buff,
    });
  }
  if (s.pactElixir > 0) {
    chips.push({
      id: "pact", name: "Эликсир пакта", polarity: "good", rounds: s.pactElixir,
      details: ["Твои приёмы бьют сильнее."],
      boosts: [{ stat: "Приёмы", value: "усилены" }],
      highlight: "dmg", color: EFFECT_COLORS.buff,
    });
  }

  /* ── Дебаффы ── */
  if (s.wound > 0) {
    chips.push({
      id: "bleed", name: "Кровотечение", polarity: "bad", rounds: s.wound,
      details: ["Рана не затягивается: кровь идёт каждый раунд."],
      boosts: [], dot: tickDot("bleed", b.p.maxHp, s.wound), color: EFFECT_COLORS.bleed,
    });
  }
  if (s.poison > 0) {
    chips.push({
      id: "poison", name: "Яд", polarity: "bad", rounds: s.poison,
      details: ["Яд в крови разъедает изнутри."],
      boosts: [], dot: tickDot("poison", b.p.maxHp, s.poison), color: EFFECT_COLORS.poison,
    });
  }
  if (s.burn > 0) {
    chips.push({
      id: "burn", name: "Горение", polarity: "bad", rounds: s.burn,
      details: ["Огонь держится на тебе и жжёт каждый раунд."],
      boosts: [], dot: tickDot("burn", b.p.maxHp, s.burn), color: EFFECT_COLORS.burn,
    });
  }
  if (s.chill > 0) {
    chips.push({
      id: "chill", name: "Обморожение", polarity: "bad", rounds: s.chill,
      details: [`Лечение ослаблено вдвое (×${CHILL_HEAL_MULT}).`],
      boosts: [{ stat: "Лечение", value: "−50%" }],
      dot: tickDot("chill", b.p.maxHp, s.chill, magicRes), color: EFFECT_COLORS.chill,
    });
  }
  if (s.curse > 0) {
    const permanent = isBattleCurse(s.curse);
    const power = s.cursePower ?? 30;
    chips.push({
      id: "curse", name: "Проклятие", polarity: "bad",
      rounds: permanent ? null : s.curse, unit: permanent ? "до конца боя" : undefined,
      details: [`Твой урон снижен на ${power}%${permanent ? " до конца боя" : ""}.`],
      boosts: [{ stat: "Урон", value: `−${power}%` }],
      dot: tickDot("curse", b.p.maxHp, permanent ? 0 : s.curse, magicRes),
      highlight: "dmg", color: EFFECT_COLORS.curse,
    });
  }
  if (s.wither > 0) {
    chips.push({
      id: "wither", name: "Увядание", polarity: "bad", rounds: s.wither,
      details: ["Любое лечение обращается против тебя магическим уроном."],
      boosts: [{ stat: "Лечение", value: "вредит" }], color: EFFECT_COLORS.wither,
    });
  }
  if (s.noHeal > 0) {
    chips.push({
      id: "noHeal", name: "Лечение перекрыто", polarity: "bad", rounds: s.noHeal,
      details: ["Зелья и приёмы лечения не работают."],
      boosts: [{ stat: "Лечение", value: "0" }], color: EFFECT_COLORS.darkness,
    });
  }
  if (s.darkness > 0) {
    chips.push({
      id: "darkness", name: "Мрак", polarity: "bad", rounds: s.darkness,
      details: ["Половина твоих атак уходит в пустоту."],
      boosts: [{ stat: "Попадание", value: "−50%" }], color: EFFECT_COLORS.darkness,
    });
  }
  if (s.sundered > 0) {
    chips.push({
      id: "sunder", name: "Раскол лат", polarity: "bad", rounds: null, unit: "до конца боя",
      details: [`Броня снижена на ${s.sundered} до конца боя.`],
      boosts: [{ stat: "Броня", value: `−${s.sundered}` }],
      highlight: "armor", color: EFFECT_COLORS.sunder,
    });
  }
  if (s.stunAp > 0) {
    chips.push({
      id: "stun", name: "Оглушение", polarity: "bad", rounds: s.stunAp, unit: "ход",
      details: ["Пропускаешь ходы: очередь короче на это число."],
      boosts: [{ stat: "Ходы", value: `−${s.stunAp}` }],
      highlight: "ap", color: EFFECT_COLORS.stun,
    });
  }
  if (s.fear > 0) {
    chips.push({
      id: "fear", name: "Страх", polarity: "bad", rounds: s.fear,
      details: ["В свой ход ты уходишь в защиту вместо действия."],
      boosts: [], color: EFFECT_COLORS.fear,
    });
  }
  if (s.burning > 0) {
    const perTick = fireBurnDamage(s.burning);
    chips.push({
      id: "burn", name: `Горение ×${s.burning}`, polarity: "bad", rounds: null, unit: "слои растут",
      badge: `×${s.burning}`,
      details: ["Огненные недра: каждый слой усиливает жар в начале твоего хода."],
      boosts: [],
      dot: { perTick, ticks: null, total: null, type: "огонь", when: "в начале твоего хода" },
      color: EFFECT_COLORS.burn,
    });
  }
  if (s.sealItems > 0) {
    chips.push({
      id: "sealItems", name: "Печать припасов", polarity: "bad", rounds: s.sealItems, unit: "ход",
      details: ["Припасы недоступны."], boosts: [], color: EFFECT_COLORS.curse,
    });
  }
  if (s.sealSkills > 0) {
    chips.push({
      id: "sealSkills", name: "Печать приёмов", polarity: "bad", rounds: s.sealSkills, unit: "ход",
      details: ["Приёмы оружия недоступны."], boosts: [], color: EFFECT_COLORS.curse,
    });
  }
  if (s.sealAttack > 0) {
    chips.push({
      id: "sealAttack", name: "Печать атаки", polarity: "bad", rounds: s.sealAttack, unit: "ход",
      details: ["Обычная атака недоступна."], boosts: [], color: EFFECT_COLORS.curse,
    });
  }

  /* ── Иммунитеты героя ── */
  if (b.p.legendaryPassives.includes("titan_heart")) {
    chips.push({
      id: "bleed", name: "Иммунитет к кровотечению", polarity: "good", immune: true, rounds: null,
      unit: "постоянно",
      details: ["Сердце колосса: кровотечение на тебя не накладывается."],
      boosts: [], color: EFFECT_COLORS.immunity,
    });
  }

  return chips;
}

/* ─────────────────────────────  МОНСТР  ───────────────────────────── */

/** Все эффекты на монстре: усиления, дебаффы и врождённые иммунитеты рода. */
export function enemyEffectChips(b: BattleState): EffectChip[] {
  const e = b.enemy;
  const s = e.statuses;
  const chips: EffectChip[] = [];
  const magicRes = enemyChance(e.effects, e.level, "magic_resist");

  if (e.guard) {
    chips.push({
      id: "guard", name: "Стойка в защиту", polarity: "good", rounds: null, unit: "до действия",
      details: ["Входящий урон режется вдвое."],
      boosts: [{ stat: "Защита", value: "−50% урона" }], color: EFFECT_COLORS.buff,
    });
  }
  if (e.fury > 0) {
    chips.push({
      id: "fury", name: "Ярость дракона", polarity: "good", rounds: e.fury,
      details: ["Двойной урон и лечение в конце своего хода."],
      boosts: [{ stat: "Урон", value: "×2" }], color: EFFECT_COLORS.buff,
    });
  }
  if (e.depleted > 0) {
    chips.push({
      id: "depleted", name: "Истощение", polarity: "bad", rounds: e.depleted,
      details: ["Положительные эффекты не работают: лечение, шипы, укрепление."],
      boosts: [], color: EFFECT_COLORS.depleted,
    });
  }
  if (e.statuses.bleed > 0) {
    chips.push({
      id: "bleed", name: "Кровотечение", polarity: "bad", rounds: s.bleed,
      details: ["Тварь истекает кровью."],
      boosts: [], dot: tickDot("bleed", e.maxHp, s.bleed), color: EFFECT_COLORS.bleed,
    });
  }
  if (s.poison > 0) {
    chips.push({
      id: "poison", name: "Яд", polarity: "bad", rounds: s.poison,
      details: ["Яд разъедает тварь изнутри."],
      boosts: [], dot: tickDot("poison", e.maxHp, s.poison), color: EFFECT_COLORS.poison,
    });
  }
  if (s.burn > 0) {
    chips.push({
      id: "burn", name: "Горение", polarity: "bad", rounds: s.burn,
      details: ["Огонь держится на твари."],
      boosts: [], dot: tickDot("burn", e.maxHp, s.burn), color: EFFECT_COLORS.burn,
    });
  }
  if (s.chill > 0) {
    chips.push({
      id: "chill", name: "Обморожение", polarity: "bad", rounds: s.chill,
      details: ["Лечение твари ослаблено вдвое."],
      boosts: [{ stat: "Лечение", value: "−50%" }],
      dot: tickDot("chill", e.maxHp, s.chill, magicRes), color: EFFECT_COLORS.chill,
    });
  }
  if (s.curse > 0) {
    const power = s.cursePower ?? 30;
    chips.push({
      id: "curse", name: "Проклятие", polarity: "bad", rounds: s.curse,
      details: [`Урон твари снижен на ${power}%.`],
      boosts: [{ stat: "Урон", value: `−${power}%` }],
      dot: tickDot("curse", e.maxHp, s.curse, magicRes), color: EFFECT_COLORS.curse,
    });
  }
  if (s.blight > 0) {
    chips.push({
      id: "blight", name: "Порча", polarity: "bad", rounds: s.blight,
      details: ["Тварь бьёт на 20% слабее."],
      boosts: [{ stat: "Урон", value: "−20%" }],
      dot: tickDot("blight", e.maxHp, s.blight), color: EFFECT_COLORS.blight,
    });
  }
  if (s.wither > 0) {
    chips.push({
      id: "wither", name: "Увядание", polarity: "bad", rounds: s.wither,
      details: ["Любое лечение твари переходит в магический урон."],
      boosts: [{ stat: "Лечение", value: "вредит" }], color: EFFECT_COLORS.wither,
    });
  }
  if (s.fear > 0) {
    chips.push({
      id: "fear", name: "Страх", polarity: "bad", rounds: s.fear,
      details: ["В свой ход тварь уходит в защиту."],
      boosts: [], color: EFFECT_COLORS.fear,
    });
  }
  if (s.sundered > 0) {
    chips.push({
      id: "sunder", name: "Раскол брони", polarity: "bad", rounds: null, unit: "до конца боя",
      details: [`Броня твари снижена на ${s.sundered}.`],
      boosts: [{ stat: "Броня", value: `−${s.sundered}` }], color: EFFECT_COLORS.sunder,
    });
  }
  if (s.stunAp > 0) {
    chips.push({
      id: "stun", name: "Оглушение", polarity: "bad", rounds: s.stunAp, unit: "ход",
      details: ["Тварь пропускает ходы."],
      boosts: [{ stat: "Ходы", value: `−${s.stunAp}` }], color: EFFECT_COLORS.stun,
    });
  }
  if (s.burning > 0) {
    const perTick = fireBurnDamage(s.burning);
    chips.push({
      id: "burn", name: `Горение ×${s.burning}`, polarity: "bad", rounds: null, unit: "слои растут",
      badge: `×${s.burning}`,
      details: ["Огненные недра жгут тварь в начале твоего хода."],
      boosts: [],
      dot: { perTick, ticks: null, total: null, type: "огонь", when: "в начале твоего хода" },
      color: EFFECT_COLORS.burn,
    });
  }
  if (e.forceGuard > 0) {
    chips.push({
      id: "guard", name: "Вынужденная оборона", polarity: "bad", rounds: e.forceGuard, unit: "ход",
      details: ["Тварь не может выйти из защиты."],
      boosts: [], color: EFFECT_COLORS.fear,
    });
  }

  /* Эффекты от снаряжения самой твари. */
  const quick = (id: "regen" | "thorns", name: string) => {
    const value = e.effectPower?.[id] ?? 0;
    if (value <= 0) return;
    chips.push({
      id, name, polarity: "good", rounds: null, unit: "постоянно",
      details: [id === "regen" ? `Затягивает раны на ${value} ОЗ в конце раунда.` : `Ранит тебя на ${value} за каждую физическую атаку.`],
      boosts: id === "regen" ? [{ stat: "Лечение", value: `+${value}` }] : [{ stat: "Шипы", value: `${value}` }],
      color: EFFECT_COLORS.buff,
    });
  };
  quick("regen", "Регенерация");
  quick("thorns", "Шипы");

  /* ── Врождённые иммунитеты рода: рамка со щитом ── */
  const meta = MONSTER_RACE_META[e.def.race] ?? MONSTER_RACE_META.none;
  const immunityNames: Record<string, { id: EffectIconId; name: string }> = {
    poison: { id: "poison", name: "Иммунитет к яду" },
    bleed: { id: "bleed", name: "Иммунитет к кровотечению" },
    fear: { id: "fear", name: "Иммунитет к страху" },
  };
  for (const key of ["poison", "bleed", "fear"] as const) {
    if (!raceImmuneTo(e.def.race, key)) continue;
    const info = immunityNames[key];
    chips.push({
      id: info.id, name: info.name, polarity: "good", immune: true, rounds: null, unit: "врождённо",
      details: [`${meta.name}: такой эффект на тварь не накладывается.`],
      boosts: [], color: EFFECT_COLORS.immunity,
    });
  }
  if (raceCannotHeal(e.def.race)) {
    chips.push({
      id: "noHeal", name: "Иммунитет к лечению", polarity: "good", immune: true, rounds: null,
      unit: "врождённо",
      details: [`${meta.name}: лечение на него не действует.`],
      boosts: [], color: EFFECT_COLORS.immunity,
    });
  }

  return chips;
}

/** Сколько иконок показывать без раскрытия «+N». */
export const EFFECT_CHIPS_VISIBLE = 8;
