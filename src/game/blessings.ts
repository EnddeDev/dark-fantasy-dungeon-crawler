/**
 * Благословения священника: усиление на один следующий поход в подземелье.
 * Покупается в лобби, активируется при спуске в подземелье и гаснет при выходе или смерти.
 */
export type BlessingId = "fortitude" | "ward" | "keen" | "veil" | "steel_faith" | "grace";

export interface BlessingDef {
  id: BlessingId;
  name: string;
  desc: string;
  /** Доля от максимального здоровья (0.1 = +10%). */
  hpPct?: number;
  /** Плоская броня. */
  armor?: number;
  /** Добавка к шансу критического удара (0.05 = +5 п.п.). */
  crit?: number;
  /** Добавка к уклонению (0.05 = +5 п.п.). */
  evade?: number;
  /** Доверие к священнику, с которого благословение доступно. */
  minTrust: number;
}

export const BLESSINGS: Record<BlessingId, BlessingDef> = {
  fortitude: { id: "fortitude", name: "Стойкость", desc: "+10% к максимальному здоровью.", hpPct: 0.1, minTrust: 0 },
  ward: { id: "ward", name: "Оберег веры", desc: "+3 к броне.", armor: 3, minTrust: 0 },
  keen: { id: "keen", name: "Ясный взор", desc: "+5% к шансу критического удара.", crit: 0.05, minTrust: 2 },
  veil: { id: "veil", name: "Тень у плеча", desc: "+5% к уклонению.", evade: 0.05, minTrust: 2 },
  steel_faith: {
    id: "steel_faith",
    name: "Стальная вера",
    desc: "+15% к максимальному здоровью и +3 к броне.",
    hpPct: 0.15,
    armor: 3,
    minTrust: 4,
  },
  grace: { id: "grace", name: "Благодать", desc: "+5% к критическому удару и +5% к уклонению.", crit: 0.05, evade: 0.05, minTrust: 5 },
};

export const BLESSING_IDS = Object.keys(BLESSINGS) as BlessingId[];

/** Цена благословения растёт вместе с открытыми этажами. */
export function blessingPrice(unlockedFloor: number): number {
  return Math.round((120 + 25 * Math.max(1, unlockedFloor)) / 5) * 5;
}

/** Суммарный эффект активного благословения (или нулевой, если его нет). */
export function blessingEffect(id: string | null | undefined): { hpPct: number; armor: number; crit: number; evade: number } {
  const def = id ? BLESSINGS[id as BlessingId] : undefined;
  return {
    hpPct: def?.hpPct ?? 0,
    armor: def?.armor ?? 0,
    crit: def?.crit ?? 0,
    evade: def?.evade ?? 0,
  };
}
