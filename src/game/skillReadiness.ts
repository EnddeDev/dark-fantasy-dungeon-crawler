import { SPECIAL_CONCENTRATION, attackStaminaCost, techniqueStaminaCost, type BattleState } from "./battle";
import { STAMINA_BY_WEIGHT, STAMINA_TECHNIQUE_EXTRA } from "./stamina";

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

  const special = canAct && conc >= SPECIAL_CONCENTRATION && !sealed;

  const ws = b.p.weaponSkill;
  const wsReady = !!ws && b.p.stats.int >= Math.max(1, ws.intReq - b.p.intDiscount) && b.p.weaponCd === 0;
  const epicReady = b.p.epicSkills.some((sk) => {
    const req = Math.max(1, sk.intReq - b.p.intDiscount);
    return b.p.stats.int >= req && (b.p.epicCds[sk.id] ?? 0) === 0;
  });
  const armorReady = b.p.armorSkills.some((sk) => {
    const req = sk.intReq <= 0 ? 0 : Math.max(1, sk.intReq - (sk.scaleStat === "int" ? b.p.intDiscount : 0));
    const statOk = req === 0 || b.p.stats[sk.scaleStat] >= req;
    const cost = STAMINA_BY_WEIGHT[sk.gearClass] + STAMINA_TECHNIQUE_EXTRA;
    return statOk && (b.p.armorCds[sk.id] ?? 0) === 0 && b.p.stamina >= cost;
  });
  /* Приём оружия или эпический стоит вес сильнейшего оружия + добавка; приём брони — свою стоимость. */
  const techOk = (wsReady || epicReady) && b.p.stamina >= techniqueStaminaCost(b);
  const skills = canAct && !sealed && conc >= 1 && (techOk || armorReady);

  const attack = canAct && b.p.statuses.sealAttack === 0 && b.p.stamina >= attackStaminaCost(b);

  return { special, skills, attack };
}
