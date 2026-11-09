import { playerAct, type BattleState } from "./battle";
import { dotSummary, durationLabel, enemyEffectChips, playerEffectChips, type EffectChip } from "./effects";

/**
 * Что даст расходник прямо сейчас: урон, лечение и эффекты в числах.
 * Считается прогоном того же действия на копии боя, поэтому совпадает с боем.
 */
export interface ConsumablePreview {
  /** Урон по текущему противнику с учётом его защиты; null — предмет урона не наносит. */
  damage: number | null;
  /** Лечение героя; null — не лечит. */
  heal: number | null;
  /** Строки эффектов: что наложится на врага или на героя, на сколько раундов и с каким тиком. */
  effects: string[];
  /** Почему применить нельзя сейчас; null — можно. */
  blocked: string | null;
}

/** Случайность в предпросмотре фиксирована: промах, уклонение и мрак не скрывают число. */
const NO_MISS_RANDOM = 0.999;

function withNoMissRandom<T>(fn: () => T): T {
  const orig = Math.random;
  Math.random = () => NO_MISS_RANDOM;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function chipLine(c: EffectChip): string {
  const dur = c.rounds == null ? "" : ` · ${durationLabel(c)}`;
  const body = c.dot ? dotSummary(c.dot) : (c.details[0] ?? "");
  return `${c.name}${dur}${body ? `: ${body}` : ""}`;
}

/** Новые или продлённые эффекты: сравниваем по иконке и сроку до и после действия. */
function newChips(before: EffectChip[], after: EffectChip[]): EffectChip[] {
  return after.filter((c) => {
    if (c.immune) return false;
    const prev = before.find((p) => p.id === c.id);
    return !prev || prev.rounds !== c.rounds;
  });
}

/**
 * Предпросмотр расходника по текущему бою. Пустой для предметов, которые сейчас нельзя применить:
 * тогда blocked объясняет причину.
 */
export function consumablePreview(b: BattleState, id: string): ConsumablePreview {
  /* Предпросмотр нужен и вне очереди героя: показываем, что будет, когда до него дойдёт. */
  /* Выносливость восстановлена: предпросмотр показывает то, что будет в начале раунда героя. */
  const probe: BattleState = { ...b, over: null, queue: ["p", "e"], idx: 0, p: { ...b.p, stamina: b.p.staminaMax } };
  const after = withNoMissRandom(() => playerAct(probe, { type: "item", id }));

  const spent = (after.bag[id] ?? 0) < (b.bag[id] ?? 0);
  if (!spent) {
    const reason = [...after.log].reverse().find((l) => l.kind === "sys")?.text ?? "Сейчас применить нельзя.";
    return { damage: null, heal: null, effects: [], blocked: reason };
  }

  const hpLost = b.enemy.hp - Math.max(0, after.enemy.hp);
  const healed = after.p.hp - b.p.hp;

  const effects: string[] = [];
  for (const c of newChips(enemyEffectChips(b), enemyEffectChips(after))) effects.push(`Враг: ${chipLine(c)}`);
  for (const c of newChips(playerEffectChips(b), playerEffectChips(after))) effects.push(`Ты: ${chipLine(c)}`);
  const armorCut = b.enemy.armor - after.enemy.armor;
  if (armorCut > 0) effects.push(`Броня врага −${armorCut}`);

  return {
    damage: hpLost > 0 ? hpLost : null,
    heal: healed > 0 ? healed : null,
    effects,
    blocked: null,
  };
}
