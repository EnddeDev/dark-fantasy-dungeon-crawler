import { MAX_CONCENTRATION, type BattleState } from "./battle";

/**
 * Готовность приёмов героя прямо сейчас. Подсветка кнопок берётся отсюда:
 * приём светится, только если его можно применить в этот ход.
 */
export interface SkillReadiness {
  /** Спец-приём архетипа: нужна полная концентрация, печать и страх его не пускают. */
  special: boolean;
  /** Кнопка «Приёмы»: хотя бы один приём оружия или снаряжения готов. */
  skills: boolean;
  /** Обычная атака: закрыта страхом, печатью атаки и чужим ходом. */
  attack: boolean;
}

/**
 * @param myTurn ход героя (не конец боя и очередь героя)
 * @param feared герой в страхе: атака, обычные приёмы и бегство закрыты
 */
export function skillReadiness(b: BattleState, myTurn: boolean, feared: boolean): SkillReadiness {
  const canAct = myTurn && !feared;
  const conc = b.p.concentration;
  const sealed = b.p.statuses.sealSkills > 0;

  const special = canAct && conc >= MAX_CONCENTRATION && !sealed;

  const ws = b.p.weaponSkill;
  const wsReady = !!ws && b.p.stats.int >= Math.max(1, ws.intReq - b.p.intDiscount) && b.p.weaponCd === 0;
  const epicReady = b.p.epicSkills.some((sk) => {
    const req = Math.max(1, sk.intReq - b.p.intDiscount);
    return b.p.stats.int >= req && (b.p.epicCds[sk.id] ?? 0) === 0;
  });
  const armorReady = b.p.armorSkills.some((sk) => {
    const req = sk.intReq <= 0 ? 0 : Math.max(1, sk.intReq - (sk.scaleStat === "int" ? b.p.intDiscount : 0));
    const statOk = req === 0 || b.p.stats[sk.scaleStat] >= req;
    return statOk && (b.p.armorCds[sk.id] ?? 0) === 0;
  });
  const skills = canAct && !sealed && conc >= 1 && (wsReady || epicReady || armorReady);

  const attack = canAct && b.p.statuses.sealAttack === 0;

  return { special, skills, attack };
}
