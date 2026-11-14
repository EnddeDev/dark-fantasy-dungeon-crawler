/**
 * Обычные приёмы оружия по 11 типам (этап 1: только данные, к бою не подключены).
 * Утверждённая спецификация: каждый приём — перезарядка 3 раунда, обычный приём.
 * `scaleMult` здесь — значение по умолчанию внутри диапазона характеристики
 * (СИЛ 1.5–3.5, ЛОВ 1.5–2.5, ИНТ 2–4.5); итоговый множитель считает `weaponSkillFor`.
 * Эффекты с суффиксом `_*` подключаются в следующих этапах боя.
 */
import type { WeaponSkillDef } from "./content";
import type { WeaponType } from "./types";

/** Эффекты новых приёмов пока не входят в закрытый тип `WeaponSkillDef.effect`: подключаются на этапах боя. */
export type NewTechnique = Omit<WeaponSkillDef, "effect"> & { effect: string };

export const TECHNIQUE_COOLDOWN = 3;

export const NEW_WEAPON_TECHNIQUES: NewTechnique[] = [
  // Кинжал
  { id: "snake_bite", name: "Укус змеи", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 1.8, effect: "snake_bite", desc: "Атака + 5×М(ЛОВ); яд на 3 раунда: 2 + 2×М(ЛОВ) за раунд. Заканчивает ход." },
  { id: "shadow_behind", name: "Тень за спиной", intReq: 4, cooldown: 3, scaleStat: "agi", scaleMult: 2.0, effect: "shadow_behind", desc: "Атака + 7×М(ЛОВ) сквозь броню. 2 заряда, восстанавливаются по перезарядке. Только первым действием хода." },
  { id: "double_cut", name: "Двойной порез", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 1.8, effect: "double_cut", desc: "Два удара по атаке и кровотечение на 3 раунда: 3 + 2×М(ЛОВ) за раунд. Заканчивает ход." },
  // Рапира
  { id: "lunge", name: "Выпад", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 2.0, effect: "lunge", desc: "Атака, заканчивает ход. Первая атака врага в этом раунде контратакуется." },
  { id: "fencing", name: "Фехтование", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 2.4, effect: "fencing_pierce", desc: "Этот ход действует; следующие атаки героя наносят урон сквозь защиту." },
  { id: "feint", name: "Обманка", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 1.8, effect: "feint", desc: "Атака, заканчивает ход. На один ход: на действие врага с шансом 20% — половина урона и конец его хода." },
  // Волшебная палочка
  { id: "repeat_last", name: "Повторение", intReq: 4, cooldown: 3, scaleStat: "int", scaleMult: 2.4, effect: "repeat_last", magic: true, desc: "Повторяет последний использованный свиток или приём. Тратит ресурсы как обычный приём." },
  { id: "bubble", name: "Пузырь", intReq: 3, cooldown: 3, scaleStat: "int", scaleMult: 2.0, effect: "bubble", magic: true, desc: "Барьер 10 + 5×М(ИНТ) на 3 хода. Поглощённый урон при окончании возвращается врагу магическим уроном." },
  { id: "spark", name: "Искра", intReq: 3, cooldown: 3, scaleStat: "int", scaleMult: 2.5, effect: "spark", magic: true, desc: "Магический урон 25 + 7×М(ИНТ). Горение на себя и врага: 3 + 2×М(ИНТ) за раунд." },
  // Меч
  { id: "advance", name: "Наступление", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 1.8, effect: "advance", desc: "Атака + 50% брони." },
  { id: "breach", name: "Пробитие", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 2.0, effect: "breach", desc: "Атака. Раскол на 3 раунда: −10 брони врага." },
  { id: "prepare", name: "Подготовка", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 1.6, effect: "prepare", desc: "+25 брони на 2 раунда, заканчивает ход. Следующая атака получает +25% брони к урону." },
  { id: "echo", name: "Эхо", intReq: 4, cooldown: 3, scaleStat: "str", scaleMult: 1.8, effect: "echo", desc: "Атака, заканчивает ход. В конце хода врага — 20% от суммы урона героя за его ход." },
  // Топор
  { id: "hew", name: "Крушение", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 2.2, effect: "hew", desc: "Атака + 2×М(СИЛ). Раскол на 3 раунда −5 брони; враг не может использовать защиту." },
  { id: "sweep", name: "Снос", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 2.0, effect: "sweep", desc: "Половина атаки. Побои на 3 раунда; каждая атака в этом раунде добавляет Побои." },
  { id: "execute", name: "Казнь", intReq: 4, cooldown: 3, scaleStat: "str", scaleMult: 2.4, effect: "execute", desc: "Атака; если у врага меньше 50% ОЗ: +50% урона и кровотечение 5% макс. ОЗ на 3 раунда. Заканчивает ход." },
  // Молот
  { id: "ring", name: "Звон", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 2.2, effect: "ring", desc: "Атака + 3×М(СИЛ), оглушение." },
  { id: "swing", name: "Размах", intReq: 4, cooldown: 3, scaleStat: "str", scaleMult: 2.0, effect: "swing", desc: "Атака + 3×М(СИЛ). Разрушение врага на 3 раунда: укрепление, сопротивления ×0,5. В начале хода врага — удар 3×М(СИЛ)." },
  { id: "plank", name: "Дробящая доска", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 2.0, effect: "plank", desc: "Атака. Раскол на 3 раунда: −25% брони." },
  // Посох
  { id: "eruption", name: "Выброс", intReq: 4, cooldown: 3, scaleStat: "int", scaleMult: 2.6, effect: "eruption", magic: true, desc: "40 урона и четыре эффекта на 3 раунда: горение (урон = ИНТ), обморожение (ИНТ−3, мин. 1, −10% урона), проклятие (1 урон, −10% урона), увядание (3 урона, −20% лечения)." },
  { id: "healing_rain", name: "Целебный дождь", intReq: 3, cooldown: 3, scaleStat: "int", scaleMult: 2.0, effect: "healing_rain", magic: true, desc: "Регенерация на 3 раунда; в начале хода лечит 5 + 2×ИНТ. Блокирует один ход врага." },
  { id: "life_draw", name: "Вытягивание жизни", intReq: 4, cooldown: 3, scaleStat: "int", scaleMult: 2.4, effect: "life_draw", magic: true, desc: "Иссушение врагу на 3 раунда. Урон 10 + 5×М(ИНТ)." },
  // Копьё
  { id: "spear_forward", name: "Копьё вперёд", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 1.6, effect: "spear_forward", desc: "Первые 2 атаки врага контратакуются. Заканчивает ход." },
  { id: "throw", name: "Бросок", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 2.0, effect: "throw", desc: "Атака + 2×М(ЛОВ). Закончил ход — враг не уходит в защиту, его атаки и физические приёмы бьют вдвое слабее до конца его хода. Продолжил атаки — кровотечение 5 + ЛОВ на 3 раунда." },
  { id: "snake_lunge", name: "Змеиный выпад", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 1.6, effect: "snake_lunge", desc: "Половина атаки. Побои 10% урона на 3 раунда; следующая атака проходит сквозь броню." },
  // Двуручный меч
  { id: "no_verdict", name: "Слабость не приговор", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 2.0, effect: "no_verdict", desc: "Снимает все негативные эффекты с героя; за каждый снятый +25 урона в этом ходу." },
  { id: "second_wind", name: "Второе дыхание", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 1.8, effect: "second_wind", desc: "Восстанавливает 25% выносливости, наносит атаку." },
  { id: "reverse_grip", name: "Обратный хват", intReq: 4, cooldown: 3, scaleStat: "str", scaleMult: 2.2, effect: "reverse_grip", desc: "В этом ходу урон героя ÷2. Атаки сквозь броню, шанс оглушить врага 25%." },
  // Двуручный топор
  { id: "guillotine", name: "Гильотина", intReq: 4, cooldown: 3, scaleStat: "str", scaleMult: 2.4, effect: "guillotine", desc: "Атака + 2×М(СИЛ). Раскол снимает 100% брони на 3 раунда." },
  { id: "funnel", name: "Воронка", intReq: 4, cooldown: 3, scaleStat: "str", scaleMult: 2.2, effect: "funnel", desc: "Атака + СИЛ×М(СИЛ). Если удар не убивает врага — −25% выносливости героя." },
  { id: "seize", name: "Захват", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 2.0, effect: "seize", desc: "Половина атаки. Уклонение героя и врага 0 на 2 раунда." },
  // Двуручный молот
  { id: "sledge", name: "Кувалда", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 2.2, effect: "sledge", desc: "Атака + 2×М(СИЛ). При промахе — половина урона." },
  { id: "wall", name: "Стена", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 1.8, effect: "wall", desc: "+25% брони, +15% стойкости на 3 раунда. Снимается после следующей атаки героя." },
  { id: "meteor", name: "Метеор", intReq: 5, cooldown: 3, scaleStat: "str", scaleMult: 2.6, effect: "meteor", desc: "Оглушение врага. Атака + 5×М(СИЛ) без возможности промаха." },
];

/** Приёмы по типу оружия: ровно как в спецификации (3 или 4 на тип). */
export const TECHNIQUES_BY_WEAPON_TYPE: Record<WeaponType, string[]> = {
  dagger: ["snake_bite", "shadow_behind", "double_cut"],
  rapier: ["lunge", "fencing", "feint"],
  wand: ["repeat_last", "bubble", "spark"],
  sword: ["advance", "breach", "prepare", "echo"],
  axe: ["hew", "sweep", "execute"],
  hammer: ["ring", "swing", "plank"],
  staff: ["eruption", "healing_rain", "life_draw"],
  spear: ["spear_forward", "throw", "snake_lunge"],
  greatsword: ["no_verdict", "second_wind", "reverse_grip"],
  greataxe: ["guillotine", "funnel", "seize"],
  warhammer: ["sledge", "wall", "meteor"],
};
