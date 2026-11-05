/**
 * Узнаваемые правила восьми обычных видов монстров. Боссы сюда не входят — их не трогаем.
 * Здесь только данные и чистые расчёты; бой подключает их в battle.ts.
 */

export interface MonsterRule {
  title: string;
  text: string;
}

/** Правило вида: название и одна строка для бестиария и лога боя. */
export const MONSTER_RULES: Record<string, MonsterRule> = {
  vermin: {
    title: "Зов стаи",
    text: "Когда ОЗ падает до половины, лечится на 15% и делает лишний ход. Один раз за бой.",
  },
  husk: {
    title: "Гниение",
    text: "Тяжёлый удар снимает 1 броню на 2 раунда. Слоёв не больше двух.",
  },
  bone: {
    title: "Костяной щит",
    text: "Каждый третий раунд первая физическая атака героя в этом раунде блокируется.",
  },
  wraith: {
    title: "Сквозь броню",
    text: "Броня поглощает не больше половины её удара.",
  },
  brute: {
    title: "Ярость мясника",
    text: "Пока ОЗ героя ниже 50%, её удары ×1.25.",
  },
  seer: {
    title: "Предвидение",
    text: "Объявляет свой следующий ход в начале раунда. Если герой повторяет прошлый приём, пророк уклоняется с шансом 50%.",
  },
  golem: {
    title: "Шлаковая шкура",
    text: "Огонь наносит вдвое меньше урона. 10% физического урона по нему возвращается герою.",
  },
  imp: {
    title: "Угольный жар",
    text: "После каждого попадания поджигает героя на 1 раунд.",
  },
};

/** Подписи ходов врага в логе и бестиарии. */
export const MOVE_LABELS: Record<string, string> = {
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

/** Крыса зовёт стаю при половине ОЗ, один раз за бой. */
export const RAT_CALL_HP_SHARE = 0.5;
export const RAT_CALL_HEAL_SHARE = 0.15;

/** Гниение: слоёв брони не больше двух, длится два раунда. */
export const ROT_MAX_STACKS = 2;
export const ROT_ROUNDS = 2;

/** Костяной щит поднимается в каждом третьем раунде. */
export const BONE_SHIELD_EVERY = 3;

/** Огр-мясник бьёт сильнее, когда у героя меньше половины ОЗ. */
export const OGRE_RAGE_MULT = 1.25;
export const OGRE_RAGE_HP_SHARE = 0.5;

/** Пророк уклоняется от повтора прошлого приёма с этим шансом. */
export const SEER_REPEAT_DODGE = 0.5;

/** Страж из шлака: огонь наносит половину, 10% физического урона возвращается. */
export const GOLEM_FIRE_MULT = 0.5;
export const GOLEM_REFLECT_SHARE = 0.1;

/** Гниение: сколько слоёв будет после очередного удара. */
export function nextRotStacks(current: number): number {
  return Math.min(ROT_MAX_STACKS, Math.max(0, current) + 1);
}

/** Крыса зовёт стаю, если ОЗ упали до половины и звать ещё не было. */
export function ratCallDue(hp: number, maxHp: number, used: boolean): boolean {
  return !used && hp > 0 && hp <= maxHp * RAT_CALL_HP_SHARE;
}

/** Броня, которую удар может поглотить по правилу «сквозь броню»: не больше половины. */
export function piercingArmorCap(damage: number, armor: number): number {
  return Math.min(armor, Math.floor(Math.max(0, damage) / 2));
}

/** Щит поднимается в раундах 3, 6, 9… */
export function boneShieldUp(round: number): boolean {
  return round > 0 && round % BONE_SHIELD_EVERY === 0;
}

/** Ярость мясника: множитель урона по ОЗ героя. */
export function ogreRageMult(heroHp: number, heroMaxHp: number): number {
  return heroHp < heroMaxHp * OGRE_RAGE_HP_SHARE ? OGRE_RAGE_MULT : 1;
}
