/**
 * События карты. Три вида:
 *  • положительное — дар без подвоха и выбор «не брать сейчас»;
 *  • нейтральное — две проверки характеристик и уход;
 *  • негативное — срабатывает само, как только герой входит в комнату.
 *
 * Событие живёт в комнате: одна комната — одно событие. На этаж выпадает
 * одно положительное, одно-два нейтральных и одно негативное (на 1–2 этажах
 * негативного нет — только положительное и нейтральное).
 */
import type { StatKey } from "./types";

export type MapEventKind = "positive" | "neutral" | "negative";

export type MapEffectKind =
  | "hp"
  | "heal"
  | "heal_full"
  | "heal_pct"
  | "dmg_pct"
  | "gold"
  | "gold_loss"
  | "gold_pct"
  | "xp"
  | "curse"
  | "poison"
  | "cleanse"
  | "reagent"
  | "supply"
  | "gear"
  | "stat"
  | "torch";

export interface MapEffect {
  k: MapEffectKind;
  v?: number;
  stat?: StatKey;
}

export interface MapEventChoice {
  id: string;
  label: string;
  detail: string;
  /** Характеристика проверки: шанс удачи растёт вместе с ней. */
  stat?: StatKey;
  /** Базовый шанс удачи при характеристике 3 (стартовой). */
  chance: number;
  good: MapEffect[];
  bad: MapEffect[];
  goodText: string;
  badText: string;
  /** Уход: событие остаётся на карте и не тратит ничего. */
  leave?: boolean;
}

/** Что призывает негативное событие: бой сразу или стаю на карту рядом с героем. */
export type MapSummon = { battle: "catastrophe" | "horror" } | { pack: number };

export interface MapEvent {
  id: string;
  kind: MapEventKind;
  name: string;
  prompt: string;
  choices: MapEventChoice[];
  /** Немедленные последствия негативного события — выбора нет. */
  effects?: MapEffect[];
  summon?: MapSummon;
  /** Что происходит на экране, когда негативное событие сработало. */
  text?: string;
}

/** Прибавка к шансу за каждую единицу характеристики сверх стартовой тройки. */
export const STAT_CHECK_STEP = 0.05;
/** Стартовое значение характеристики: от него считается проверка. */
export const STAT_CHECK_BASE = 3;

/** Итоговый шанс удачи с учётом характеристики героя. */
export function choiceChance(choice: MapEventChoice, stats: Record<StatKey, number>): number {
  if (!choice.stat) return choice.chance;
  const value = stats[choice.stat] ?? STAT_CHECK_BASE;
  return Math.max(0.05, Math.min(0.95, choice.chance + STAT_CHECK_STEP * (value - STAT_CHECK_BASE)));
}

const later = (label: string, detail: string): MapEventChoice => ({
  id: "later",
  label,
  detail,
  chance: 1,
  good: [],
  bad: [],
  goodText: "",
  badText: "",
  leave: true,
});

/* ═══════════════  ПОЛОЖИТЕЛЬНЫЕ  ═══════════════ */

export const POSITIVE_EVENTS: MapEvent[] = [
  {
    id: "life_spring",
    kind: "positive",
    name: "Источник жизни",
    prompt: "Вода выходит из камня ровным кругом. Пахнет железом и живой кровью.",
    choices: [
      {
        id: "drink",
        label: "Испить",
        detail: "Полное здоровье, один раз",
        chance: 1,
        good: [{ k: "heal_full" }],
        bad: [],
        goodText: "Глоток обжигает, а потом тело вспоминает, каким было до подземелья. Здоровье восстановлено полностью.",
        badText: "",
      },
      later("Не пить сейчас", "Вода подождёт своего часа"),
    ],
  },
  {
    id: "quiet_chapel",
    kind: "positive",
    name: "Тихая часовня",
    prompt: "Скамьи истлели, но камень тёплый. Кто-то сидел здесь до тебя и ушёл сам.",
    choices: [
      {
        id: "rest",
        label: "Посидеть в тишине",
        detail: "Восстановить 60 % здоровья",
        chance: 1,
        good: [{ k: "heal_pct", v: 60 }],
        bad: [],
        goodText: "Ты вытягиваешь ноги и позволяешь себе выдохнуть. Боль уходит вместе с дыханием.",
        badText: "",
      },
      later("Пройти мимо", "Остаться в дороге"),
    ],
  },
  {
    id: "healer_bag",
    kind: "positive",
    name: "Сумка лекаря",
    prompt: "Хозяин сумки ушёл дальше, чем смог вернуться. Склянки целы.",
    choices: [
      {
        id: "take",
        label: "Забрать лекарства",
        detail: "45 здоровья и 2 припаса",
        chance: 1,
        good: [{ k: "heal", v: 45 }, { k: "supply", v: 2 }],
        bad: [],
        goodText: "Ты перевязываешься чистой тканью и забираешь склянки: две из них ещё пахнут делом.",
        badText: "",
      },
      later("Не трогать", "Чужое останется чужим"),
    ],
  },
  {
    id: "clean_spring",
    kind: "positive",
    name: "Студёный родник",
    prompt: "Вода такая холодная, что ломит зубы. На вкус — чистая.",
    choices: [
      {
        id: "wash",
        label: "Умыться и испить",
        detail: "25 здоровья, снимает яд и проклятие",
        chance: 1,
        good: [{ k: "heal", v: 25 }, { k: "cleanse" }],
        bad: [],
        goodText: "Студёная вода смывает с кожи бурую дрянь, и дурнота под ложечкой отступает.",
        badText: "",
      },
      later("Обойти", "Не сегодня"),
    ],
  },
  {
    id: "reagent_garden",
    kind: "positive",
    name: "Сад реагентов",
    prompt: "В каменном ящике — сырая земля и три крепких ростка. Кто-то поливал их долго.",
    choices: [
      {
        id: "harvest",
        label: "Собрать урожай",
        detail: "Три реагента",
        chance: 1,
        good: [{ k: "reagent", v: 3 }],
        bad: [],
        goodText: "Ты срезаешь всё до земли: три реагента в мешке, земля остаётся ждать следующего.",
        badText: "",
      },
      later("Оставить расти", "Пусть живёт"),
    ],
  },
  {
    id: "coin_purse",
    kind: "positive",
    name: "Кисет в паутине",
    prompt: "Паутина держит кисет так аккуратно, будто его подвесили.",
    choices: [
      {
        id: "cut",
        label: "Срезать кисет",
        detail: "45 золота и немного опыта",
        chance: 1,
        good: [{ k: "gold", v: 45 }, { k: "xp", v: 15 }],
        bad: [],
        goodText: "Монеты сухие и тяжёлые. Пока развязываешь завязку, успеваешь понять пару чужих уловок.",
        badText: "",
      },
      later("Не рисковать", "Паутина неспроста"),
    ],
  },
  {
    id: "weapon_rack",
    kind: "positive",
    name: "Стойка с оружием",
    prompt: "Стойка наклонена, но железо на ней ещё держится.",
    choices: [
      {
        id: "take",
        label: "Снять с полки",
        detail: "Неизученный предмет уровня этажа",
        chance: 1,
        good: [{ k: "gear", v: 1 }],
        bad: [],
        goodText: "Ты берёшь то, что получше держится в руке. Металл холодный, замок на нём ещё не тронут.",
        badText: "",
      },
      later("Не брать", "Своё надёжнее"),
    ],
  },
  {
    id: "torch_brazier",
    kind: "positive",
    name: "Жаровня с маслом",
    prompt: "В чаше плещется масло, и фитиль ещё не сгорел.",
    choices: [
      {
        id: "light",
        label: "Заправить факел",
        detail: "14 ходов света и немного опыта",
        chance: 1,
        good: [{ k: "torch", v: 14 }, { k: "xp", v: 20 }],
        bad: [],
        goodText: "Огонь встаёт ровно и держится: на несколько переходов темнота отступает.",
        badText: "",
      },
      later("Оставить", "Масло пригодится другому"),
    ],
  },
  {
    id: "warm_embers",
    kind: "positive",
    name: "Тёплые угли",
    prompt: "Пепел под слоем золы ещё живой. Руки над ним отходят сразу.",
    choices: [
      {
        id: "warm",
        label: "Погреться",
        detail: "35 здоровья и 10 ходов света",
        chance: 1,
        good: [{ k: "heal", v: 35 }, { k: "torch", v: 10 }],
        bad: [],
        goodText: "Ты греешь ладони и заодно вытягиваешь ноги. Тепло расходится по телу, а факел набирается огня.",
        badText: "",
      },
      later("Идти дальше", "Не до тепла"),
    ],
  },
  {
    id: "lost_prayer",
    kind: "positive",
    name: "Чужая молитва",
    prompt: "На стене выцарапаны слова, которые повторяли много раз. Побелка стёрлась под ладонью.",
    choices: [
      {
        id: "read",
        label: "Прочитать вслух",
        detail: "70 опыта и часть здоровья",
        chance: 1,
        good: [{ k: "xp", v: 70 }, { k: "heal_pct", v: 25 }],
        bad: [],
        goodText: "Слова укладываются в голове сами. На последней строке дыхание выравнивается, а рана подтягивается.",
        badText: "",
      },
      later("Не повторять", "Чужие слова — чужая ноша"),
    ],
  },
];

/* ═══════════════  НЕЙТРАЛЬНЫЕ  ═══════════════ */

export const NEUTRAL_EVENTS: MapEvent[] = [
  {
    id: "altar",
    kind: "neutral",
    name: "Алтарь неизвестного",
    prompt: "Камень тёплый, а на нём — свежая влага. Кто-то успел раньше тебя.",
    choices: [
      {
        id: "blood",
        label: "Пролить кровь",
        detail: "Опыт за кровь",
        stat: "str",
        chance: 0.55,
        good: [{ k: "xp", v: 70 }, { k: "hp", v: -18 }],
        bad: [{ k: "xp", v: 26 }, { k: "hp", v: -34 }],
        goodText: "Алтарь принимает дар и отвечает прорывом опыта, но плечо гудит ещё долго.",
        badText: "Алтарь пьёт молча и почти ничего не даёт — плечо ноет.",
      },
      {
        id: "signs",
        label: "Прочесть знаки",
        detail: "Понять, что здесь оставили",
        stat: "int",
        chance: 0.6,
        good: [{ k: "xp", v: 45 }, { k: "reagent", v: 2 }],
        bad: [{ k: "xp", v: 15 }, { k: "poison", v: 2 }],
        goodText: "Знаки складываются в рецепт: два реагента отдельно, порядок — в голове.",
        badText: "Строки читаются не в ту сторону, и под ложечкой начинает горчить.",
      },
      later("Уйти", "Не трогать алтарь"),
    ],
  },
  {
    id: "well",
    kind: "neutral",
    name: "Колодец без дна",
    prompt: "Верёвка на блоке, ведро внизу. Оттуда тянет холодом и медом.",
    choices: [
      {
        id: "bucket",
        label: "Поднять ведро",
        detail: "Ловкость против тугого ворота",
        stat: "agi",
        chance: 0.55,
        good: [{ k: "gold", v: 45 }, { k: "hp", v: -10 }],
        bad: [{ k: "reagent", v: 1 }, { k: "curse", v: 2 }],
        goodText: "В ведре кожаный мешочек: рыба сгнила, монеты остались. Тянуть пришлось до хруста в пальцах.",
        badText: "Мешочек пуст, зато снизу донеслось, как тебя зовут по имени.",
      },
      {
        id: "listen",
        label: "Прислушаться к глубине",
        detail: "Понять голос колодца",
        stat: "int",
        chance: 0.6,
        good: [{ k: "xp", v: 55 }, { k: "supply", v: 1 }],
        bad: [{ k: "xp", v: 18 }, { k: "curse", v: 3 }],
        goodText: "В шуме воды слышна чужая считалка: она подсказывает, где стоит пол, а где нет.",
        badText: "Глубина отвечает на твой вопрос своим, и ответ остаётся в голове сквозняком.",
      },
      later("Отойти", "Колодец подождёт"),
    ],
  },
  {
    id: "mirror",
    kind: "neutral",
    name: "Обсидиановое зеркало",
    prompt: "В чёрном стекле отражается комната, но без тебя.",
    choices: [
      {
        id: "touch",
        label: "Прикоснуться",
        detail: "Выдержать отражение",
        stat: "int",
        chance: 0.55,
        good: [{ k: "xp", v: 65 }, { k: "gold", v: -13 }],
        bad: [{ k: "xp", v: 24 }, { k: "curse", v: 3 }],
        goodText: "Стекло холодное, а в голове сразу готовая мысль. Ты понимаешь больше, чем стоил этот опыт.",
        badText: "Отражение не моргнуло. Взамен ты получаешь задержку в размышлениях и порчу.",
      },
      {
        id: "break",
        label: "Разбить зеркало",
        detail: "Металл о стекло",
        stat: "str",
        chance: 0.5,
        good: [{ k: "reagent", v: 2 }, { k: "xp", v: 25 }],
        bad: [{ k: "reagent", v: 1 }, { k: "hp", v: -20 }],
        goodText: "Осколки режутся чисто — оба можно унести, и оба ещё гудят чужой мыслью.",
        badText: "Осколок рвёт ладонь: часть руны потеряна, но один осколок цел.",
      },
      later("Отвернуться", "Не манит"),
    ],
  },
  {
    id: "cache",
    kind: "neutral",
    name: "Ниша с записками",
    prompt: "За камнем — чья-то выемка с записками на коре.",
    choices: [
      {
        id: "read",
        label: "Прочитать записки",
        detail: "Разобрать чужой почерк",
        stat: "int",
        chance: 0.6,
        good: [{ k: "xp", v: 55 }, { k: "poison", v: 1 }],
        bad: [{ k: "xp", v: 22 }, { k: "curse", v: 2 }],
        goodText: "Записки ведут до клада в соседнем коридоре и разбирают подземелье, как ладонь.",
        badText: "Почерк разборчив, но последняя строка — твоя фамилия, выведенная заранее.",
      },
      {
        id: "grab",
        label: "Забрать всё",
        detail: "Быстро, пока не рассыпалось",
        stat: "agi",
        chance: 0.55,
        good: [{ k: "gold", v: 38 }, { k: "reagent", v: 1 }],
        bad: [{ k: "gold", v: 15 }, { k: "hp", v: -18 }],
        goodText: "В свёртке мешочек с золотом и сухой мох. Ты успеваешь вытащить всё до того, как кора рассыплется.",
        badText: "Свёрток срывается под рукой, а рванувший узел бьёт по виску.",
      },
      later("Оставить", "Чужое — чужое"),
    ],
  },
  {
    id: "mark",
    kind: "neutral",
    name: "Клеймённая колонна",
    prompt: "На камне — символ, нарисованный так часто, что стёрся в ямку.",
    choices: [
      {
        id: "take",
        label: "Принять клеймо",
        detail: "Характеристика за кровь",
        stat: "str",
        chance: 0.55,
        good: [{ k: "stat", v: 1, stat: "str" }, { k: "hp", v: -24 }],
        bad: [{ k: "xp", v: 40 }, { k: "curse", v: 3 }],
        goodText: "Тело твердеет: сила в пригоршне, но шрам уже не сойдёт.",
        badText: "Клеймо не легло — осталась лишь печать усталости и чужое неудовольствие.",
      },
      {
        id: "scrape",
        label: "Соскоблить символ",
        detail: "Снять порох с камня",
        stat: "int",
        chance: 0.6,
        good: [{ k: "reagent", v: 2 }, { k: "gold", v: 23 }],
        bad: [{ k: "hp", v: -14 }, { k: "reagent", v: 1 }],
        goodText: "Порох из выемки сходит слоями: два горстья и мелочь наверху.",
        badText: "Камень хрупок: руку рвёт об осколок, но одна горсть пороха цела.",
      },
      later("Пройти мимо", "Не всякий символ стоит читать"),
    ],
  },
  {
    id: "bones",
    kind: "neutral",
    name: "Костяной молельщик",
    prompt: "Скелет стоит на коленях лицом к стене. Пальцы сложены, будто он ещё считает.",
    choices: [
      {
        id: "answer",
        label: "Ответить на счёт",
        detail: "Продолжить чужую молитву",
        stat: "int",
        chance: 0.6,
        good: [{ k: "xp", v: 50 }, { k: "stat", v: 1, stat: "int" }],
        bad: [{ k: "xp", v: 20 }, { k: "curse", v: 3 }],
        goodText: "Ты называешь следующее число, и скелет разжимает пальцы. В голове становится яснее.",
        badText: "Счёт сбивается на третьей строке, и в ушах остаётся чужое бормотание.",
      },
      {
        id: "break",
        label: "Сломать скелет",
        detail: "Разобрать на части",
        stat: "str",
        chance: 0.6,
        good: [{ k: "reagent", v: 2 }, { k: "gold", v: 20 }],
        bad: [{ k: "hp", v: -16 }, { k: "poison", v: 2 }],
        goodText: "Кости идут сухо, как сучья. В тазовой чаше — две горсти порошка и мелочь.",
        badText: "Скелет не рассыпается сразу: костяная рука успевает достать тебя напоследок.",
      },
      later("Оставить молиться", "Не мешать"),
    ],
  },
  {
    id: "sarcophagus",
    kind: "neutral",
    name: "Запечатанный саркофаг",
    prompt: "Крышка пригнана так плотно, что щели не видно. Печать содрана чьими-то ногтями.",
    choices: [
      {
        id: "shift",
        label: "Сдвинуть крышку",
        detail: "Сила против камня",
        stat: "str",
        chance: 0.5,
        good: [{ k: "gear", v: 1 }, { k: "xp", v: 20 }],
        bad: [{ k: "hp", v: -22 }, { k: "curse", v: 3 }],
        goodText: "Крышка идёт с третьего раза. Внутри — вещь, уложенная в изголовье, и сухой воздух.",
        badText: "Крышка срывается и бьёт по пальцам; из щели тянет сладковатой гнилью.",
      },
      {
        id: "seam",
        label: "Вскрыть шов",
        detail: "Аккуратно, по линии печати",
        stat: "agi",
        chance: 0.55,
        good: [{ k: "gold", v: 40 }, { k: "reagent", v: 1 }],
        bad: [{ k: "poison", v: 2 }, { k: "xp", v: 15 }],
        goodText: "Шов поддаётся по линии, как шов на рукаве. Внутри — монеты и горсть бурого порошка.",
        badText: "Из шва бьёт пыль, и дышать становится трудно. Опыт ты всё же выносишь.",
      },
      later("Оставить печать", "Пусть лежит"),
    ],
  },
  {
    id: "bells",
    kind: "neutral",
    name: "Подвешенные колокола",
    prompt: "Под потолком — ряд колоколов без языков. Ветер задевает их, но звука нет.",
    choices: [
      {
        id: "pass",
        label: "Пройти под ними",
        detail: "Не задеть ни один",
        stat: "agi",
        chance: 0.6,
        good: [{ k: "xp", v: 45 }, { k: "supply", v: 1 }],
        bad: [{ k: "hp", v: -15 }, { k: "curse", v: 2 }],
        goodText: "Ты проходишь ровно, и колокола молчат. На полу — чей-то оброненный свёрток.",
        badText: "Плечо задевает край, и в тишине лопается низкий звук. Голова гудит до конца комнаты.",
      },
      {
        id: "strike",
        label: "Ударить в нужный",
        detail: "Найти колокол без языка",
        stat: "int",
        chance: 0.55,
        good: [{ k: "stat", v: 1, stat: "agi" }, { k: "xp", v: 25 }],
        bad: [{ k: "xp", v: 18 }, { k: "poison", v: 2 }],
        goodText: "Ты бьёшь в четвёртый — он единственный отзывается телом, а не слухом. Шаг становится легче.",
        badText: "Отзывается не тот колокол. Дыхание сбивается, и в горле остаётся медный привкус.",
      },
      later("Обойти", "Тишина дороже"),
    ],
  },
  {
    id: "smoke_vein",
    kind: "neutral",
    name: "Дымная жила",
    prompt: "Из трещины в породе сочится тёплый дым. Он стелется по полу, не поднимаясь.",
    choices: [
      {
        id: "inhale",
        label: "Вдохнуть дым",
        detail: "Понять, что в нём",
        stat: "int",
        chance: 0.55,
        good: [{ k: "xp", v: 60 }, { k: "torch", v: 8 }],
        bad: [{ k: "poison", v: 3 }, { k: "hp", v: -12 }],
        goodText: "Дым пахнет смолой и чужими снами. Ты видишь коридор целиком, будто уже прошёл его.",
        badText: "Дым оседает в лёгких, и до конца комнаты ты дышишь через мокрую тряпку.",
      },
      {
        id: "crack",
        label: "Расколоть породу",
        detail: "Добраться до жилы",
        stat: "str",
        chance: 0.5,
        good: [{ k: "reagent", v: 2 }, { k: "gold", v: 30 }],
        bad: [{ k: "hp", v: -18 }, { k: "reagent", v: 1 }],
        goodText: "Порода идёт по шву, и внутри оказывается пустота с бурой смолой и чужой заначкой.",
        badText: "Трещина бьёт паром в лицо, а из заначки удаётся вытащить только одну горсть.",
      },
      later("Обойти дым", "Не дышать"),
    ],
  },
  {
    id: "stranger",
    kind: "neutral",
    name: "Путник без лица",
    prompt: "Он сидит у стены и держит мешок на коленях. Лица нет — только тень под капюшоном.",
    choices: [
      {
        id: "talk",
        label: "Заговорить",
        detail: "Узнать дорогу",
        stat: "int",
        chance: 0.6,
        good: [{ k: "xp", v: 55 }, { k: "gold", v: 25 }],
        bad: [{ k: "xp", v: 20 }, { k: "gold", v: -12 }],
        goodText: "Он отвечает коротко и по делу: где вода, где обвал, где не стоит задерживаться. За разговор платит сам.",
        badText: "Разговор идёт по кругу, а на прощание мешок на твоём поясе становится легче.",
      },
      {
        id: "search",
        label: "Обшарить его мешок",
        detail: "Он не смотрит",
        stat: "agi",
        chance: 0.5,
        good: [{ k: "gold", v: 50 }, { k: "reagent", v: 2 }],
        bad: [{ k: "hp", v: -20 }, { k: "curse", v: 3 }],
        goodText: "Рука входит в мешок по локоть, хотя мешок мал. Обратно выходит с монетами и порошком.",
        badText: "Мешок сжимается на руке, как кулак. Ты вырываешься, но капюшон поворачивается вслед.",
      },
      later("Пройти мимо", "Не все собеседники нужны"),
    ],
  },
];

/* ═══════════════  НЕГАТИВНЫЕ  ═══════════════ */

export const NEGATIVE_EVENTS: MapEvent[] = [
  {
    id: "rift_summon",
    kind: "negative",
    name: "Трещина в полу",
    prompt: "Пол расходится по шву, и из щели поднимается дыхание размером с комнату.",
    text: "Из трещины вылезает катастрофа: тварь, которой положено быть у лестницы, а не здесь. Бежать некуда — она уже смотрит.",
    summon: { battle: "catastrophe" },
    choices: [],
  },
  {
    id: "pack_ambush",
    kind: "negative",
    name: "Засада из темноты",
    prompt: "С потолка сыплется труха, и по углам разом поднимаются тени.",
    text: "Четыре твари отрезают выход и расходятся по комнате. Каждая ждёт своей очереди, но драк будет много.",
    summon: { pack: 4 },
    choices: [],
  },
  {
    id: "ceiling_collapse",
    kind: "negative",
    name: "Обвал",
    prompt: "Сверху щёлкает, и потолок решает, что пора.",
    text: "Камень бьёт по плечам и спине. Ты выходишь из пыли на четвереньках, оставляя на полу часть себя.",
    effects: [{ k: "dmg_pct", v: 25 }],
    choices: [],
  },
  {
    id: "cursed_doll",
    kind: "negative",
    name: "Проклятая кукла",
    prompt: "На полу сидит кукла, сшитая из чужой кожи. Она поворачивает голову первой.",
    text: "Кукла смотрит, и порча входит под кожу, как ржавчина в железо. Яд в крови отзывается на неё.",
    effects: [{ k: "curse", v: 3 }, { k: "poison", v: 2 }],
    choices: [],
  },
  {
    id: "gold_thief",
    kind: "negative",
    name: "Вор в темноте",
    prompt: "Кто-то дышит за спиной, но оборачиваться уже поздно.",
    text: "Мешок дёргается и становится легче. Вора нет — только монеты, звякнувшие где-то за стеной.",
    effects: [{ k: "gold_pct", v: 25 }],
    choices: [],
  },
  {
    id: "rot_mist",
    kind: "negative",
    name: "Гнилая дымка",
    prompt: "Воздух в комнате стал мягким и сладким. Слишком сладким.",
    text: "Дымка оседает в лёгких, и с каждым вдохом дышать всё тяжелее. Гниль остаётся в крови.",
    effects: [{ k: "poison", v: 3 }, { k: "hp", v: -12 }],
    choices: [],
  },
  {
    id: "floor_pit",
    kind: "negative",
    name: "Провал пола",
    prompt: "Камень под ногой не выдерживает — он и не собирался.",
    text: "Ты падаешь в узкую щель и выбираешься по чужим костям. Колено и рёбра помнят каждый выступ.",
    effects: [{ k: "dmg_pct", v: 18 }, { k: "poison", v: 2 }],
    choices: [],
  },
  {
    id: "bone_hands",
    kind: "negative",
    name: "Руки из праха",
    prompt: "Из пола поднимаются пальцы — сначала один, потом десяток.",
    text: "Костяные пальцы вцепляются в ноги и тянут вниз. Ты вырываешься, но в кожу уже въелась могильная сухость.",
    effects: [{ k: "hp", v: -14 }, { k: "curse", v: 2 }],
    choices: [],
  },
  {
    id: "horror_approach",
    kind: "negative",
    name: "Ужас навстречу",
    prompt: "Из прохода доносится шаг, от которого дрожит пыль на балках.",
    text: "Ужас подземелья заходит в комнату так, будто это его дом. Дверь за спиной захлопывается сама.",
    summon: { battle: "horror" },
    choices: [],
  },
  {
    id: "tithe",
    kind: "negative",
    name: "Сборщик десятины",
    prompt: "У стены стоит чаша, а рядом — фигура, которую нельзя разглядеть до конца.",
    text: "Чаша сама поднимается к твоему поясу. Десятина списана, и спорить с ней некому.",
    effects: [{ k: "gold_pct", v: 20 }, { k: "curse", v: 2 }],
    choices: [],
  },
];

export const MAP_EVENTS: MapEvent[] = [...POSITIVE_EVENTS, ...NEUTRAL_EVENTS, ...NEGATIVE_EVENTS];

export function mapEventById(id: string): MapEvent | undefined {
  return MAP_EVENTS.find((e) => e.id === id);
}

export function eventsOfKind(kind: MapEventKind): MapEvent[] {
  return MAP_EVENTS.filter((e) => e.kind === kind);
}

/**
 * План событий этажа: сколько каких комнат занять.
 * 1–2 этаж — положительное и нейтральное; с 3 этажа добавляется негативное
 * и второе нейтральное через раз. Всё ограничено числом свободных комнат.
 */
export function rollFloorEventPlan(floor: number, roomCount: number): MapEventKind[] {
  const plan: MapEventKind[] =
    floor <= 2
      ? ["positive", "neutral"]
      : ["positive", ...(Math.random() < 0.5 ? (["neutral"] as MapEventKind[]) : (["neutral", "neutral"] as MapEventKind[])), "negative"];
  return plan.slice(0, Math.max(0, Math.min(plan.length, roomCount)));
}

/** Случайные события под план этажа — без повторов внутри этажа. */
export function drawEventsForPlan(plan: MapEventKind[], rng: () => number = Math.random): MapEvent[] {
  const used = new Set<string>();
  const out: MapEvent[] = [];
  for (const kind of plan) {
    const pool = eventsOfKind(kind).filter((e) => !used.has(e.id));
    if (!pool.length) continue;
    const ev = pool[Math.floor(rng() * pool.length)];
    used.add(ev.id);
    out.push(ev);
  }
  return out;
}
