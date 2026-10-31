import type { ReactNode } from "react";
import {
  Brain,
  ChevronRight,
  FlaskConical,
  Hammer,
  MousePointerClick,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Store,
  Sword,
  Swords,
} from "lucide-react";
import {
  ARCHETYPES,
  ARCHETYPE_ORDER,
  BREW_FAILURE_CHANCE,
  CREATURE_META,
  ENEMIES,
  GEAR_BASES,
  MAX_LEVEL,
  RARITY_META,
  REAGENTS,
  STAT_META,
  WEAR_META,
  statPointCost,
  xpForNextLevel,
} from "../game/content";
import { MAP_EVENTS } from "../game/world";
import { MAX_SIZE, MIN_SIZE, TORCH, chestCountForFloor, mazeSizeForFloor } from "../game/maze";
import { SLOT_META, SLOT_ORDER } from "../game/types";
import type { RarityTier, StatKey, WearTier } from "../game/types";
import { Btn, RarityBadge, Rune, Tag } from "./ui";

const stages = [1, 2, 3, 4, 5, 8, 10];

const GUIDE_NAV = [
  { href: "#guide-stats", label: "Характеристики" },
  { href: "#guide-gear", label: "Снаряжение" },
  { href: "#guide-combat", label: "Правила боя" },
  { href: "#guide-reference", label: "Подробности" },
] as const;

const STAT_CARDS: {
  id: StatKey;
  icon: typeof Sword;
  tagline: string;
  points: string[];
}[] = [
  {
    id: "str",
    icon: Sword,
    tagline: "Живучесть и тяжёлый удар",
    points: [
      "+6 здоровья за каждое очко.",
      "+0.8 к урону оружием за очко (округляется вниз).",
      "+6% к стойкости против ран, проклятия, яда и оглушения.",
      "Открывает силовое снаряжение и приёмы тяжёлого оружия.",
    ],
  },
  {
    id: "agi",
    icon: Sparkles,
    tagline: "Темп, расходники и фехтование",
    points: [
      "+1 ход в раунде за каждые 2 очка.",
      "Усиливает все расходники: зелья, свитки, бомбы и кинжалы.",
      "Усиливает приёмы ловкого оружия и помогает обезвреживать ловушки.",
      "Открывает лёгкие клинки и ловчее снаряжение.",
    ],
  },
  {
    id: "int",
    icon: Brain,
    tagline: "Приёмы, свитки и знания",
    points: [
      "Открывает приёмы оружия и эпические способности снаряжения.",
      "Позволяет читать свитки и исследовать найденные вещи.",
      "Открывает рецепты алхимии и мастерской.",
      "Не усиливает расходники напрямую — только даёт доступ к свиткам и приёмам.",
    ],
  },
];

const COST_ROWS: { label: string; target: number }[] = [
  { label: "2–3", target: 2 },
  { label: "4", target: 4 },
  { label: "5", target: 5 },
  { label: "6", target: 6 },
  { label: "7–8", target: 7 },
  { label: "9", target: 9 },
  { label: "10", target: 10 },
];

const QUALITY_ROWS: { tier: RarityTier; text: string }[] = [
  { tier: "common", text: "Базовые характеристики. У оружия может быть приём." },
  { tier: "rare", text: "Базовые характеристики плюс один дополнительный эффект." },
  { tier: "epic", text: "Свойство редкого плюс ещё два эффекта или активная способность предмета." },
  { tier: "legendary", text: "Всё предыдущее плюс уникальная пассивная способность." },
];

const WEAR_ROWS: { tier: WearTier; text: string }[] = [
  { tier: "new", text: "Лучшее состояние: предмет заметно сильнее обычного." },
  { tier: "worn", text: "Нормальное состояние: базовые множители без штрафа." },
  { tier: "battered", text: "Плохое состояние: характеристики снижены, зато вещь дешевле." },
];

const COMBAT_ACTIONS = [
  { name: "Удар", text: "Обычная атака оружием. Тратит один ход." },
  { name: "Приёмы", text: "Особый приём оружия или эпическая способность. Нужен Интеллект; после использования — перезарядка." },
  { name: "Рюкзак", text: "Выпить зелье, прочитать свиток или бросить расходник. Тратит один ход." },
  { name: "Защита", text: "Входящий урон вдвое меньше до твоего следующего хода." },
  { name: "Побег", text: "Завершает бой, но может унести до 70% добычи текущего похода." },
];

const STATUS_ROWS = [
  { name: "Кровотечение / яд", text: "Отнимают здоровье в конце раунда." },
  { name: "Замерзание", text: "Урон врага −30%." },
  { name: "Проклятие", text: "Твой урон −30%." },
  { name: "Порча", text: "Урон врага −20% и потеря здоровья за раунд." },
  { name: "Увядание", text: "Любое лечение врага −75%." },
  { name: "Кислота", text: "Снимает броню врага." },
  { name: "Оглушение", text: "Отнимает ходы в следующем раунде." },
];

function GuideSection({
  id,
  step,
  title,
  children,
}: {
  id: string;
  step: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-b border-line py-6">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[0.9rem] text-flamedim">{step}</span>
        <h4 id={`${id}-title`} className="font-display text-2xl uppercase tracking-[0.1em] text-flamehi">
          {title}
        </h4>
      </div>
      <div className="mt-3 space-y-4 text-[1.02rem] leading-relaxed text-parch/85">{children}</div>
    </section>
  );
}

function Reference({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-6 border border-line bg-black/25">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-display text-[1.08rem] uppercase tracking-[0.1em] text-flamehi transition-colors hover:bg-slab2">
        {title}
        <ChevronRight size={15} className="shrink-0 text-mute transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-line/70 px-4 py-4 text-[0.98rem] leading-relaxed text-parch/85">
        {children}
      </div>
    </details>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-flamedim bg-black/25 px-3 py-2.5 text-[0.98rem] leading-relaxed text-parch/90">
      {children}
    </p>
  );
}

export function Guide({
  onOpenShop,
  onOpenArmory,
  onOpenBestiary,
}: {
  onOpenShop: () => void;
  onOpenArmory: () => void;
  onOpenBestiary: () => void;
}) {
  const gearCount = Object.keys(GEAR_BASES).length;
  const foeCount = ENEMIES.length;

  return (
    <article className="mx-auto max-w-4xl pb-8">
      {/* Коротко о игре — до всех таблиц и подробностей. */}
      <header id="guide-about" className="scroll-mt-6 border-b border-line pb-5">
        <span className="sc text-flamedim">Полевой справочник · издание для живых</span>
        <h3 className="mt-1 font-title text-3xl text-flamehi sm:text-4xl">Как играть</h3>
        <p className="mt-3 max-w-3xl text-[1.08rem] leading-relaxed text-parch/90">
          <b className="text-flamehi">СУМРАК</b> — тёмное фэнтези о вылазках в подземный лабиринт.
          Исследуй этажи, сражайся с чудовищами, собирай снаряжение и возвращайся в лобби живым.
          Только вынесенная добыча становится твоей: смерть забирает находки текущего спуска,
          но уровень, характеристики и развитие героя остаются.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            ["Исследуй", "Открывай карту, ищи ключи, сундуки и события."],
            ["Сражайся", "Побеждай монстров и Стража перед лестницей."],
            ["Возвращайся", "Забирай добычу, развивай героя и лавку, спускайся снова."],
          ].map(([title, text], i) => (
            <div key={title} className="border border-line bg-black/30 p-3">
              <div className="font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">
                {i + 1}. {title}
              </div>
              <p className="mt-1 text-[0.95rem] leading-snug text-mute">{text}</p>
            </div>
          ))}
        </div>
        <nav aria-label="Разделы справочника" className="mt-4 flex flex-wrap gap-2">
          {GUIDE_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="border border-line bg-slab2 px-3 py-2 font-mono text-[0.88rem] text-parch/85 transition-colors hover:border-flamedim hover:text-flamehi"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      {/* 01 — характеристики */}
      <GuideSection id="guide-stats" step="01" title="Характеристики">
        <p>
          Герой начинает с <b className="text-flamehi">1 Силы, 1 Ловкости и 1 Интеллекта</b> и{" "}
          <b className="text-flamehi">2 свободных очка</b>. За каждый новый уровень — ещё{" "}
          <b className="text-flamehi">3 очка</b>. Максимум характеристики — 10, максимальный уровень героя — {MAX_LEVEL}.
          Очки тратятся во вкладке «Развитие».
        </p>
        <div className="grid gap-3 lg:grid-cols-3">
          {STAT_CARDS.map(({ id, icon: Icon, tagline, points }) => (
            <div key={id} className="border border-line bg-black/30 p-4">
              <div className="flex items-center gap-2">
                <Icon size={17} className="text-flame" aria-hidden />
                <span className="font-display text-[1.15rem] uppercase tracking-[0.08em] text-flamehi">
                  {STAT_META[id].name}
                </span>
                <span className="ml-auto font-mono text-[0.84rem] text-flamedim">{STAT_META[id].short}</span>
              </div>
              <p className="mt-1 text-[0.95rem] italic text-mute">{tagline}</p>
              <ul className="mt-2 space-y-1.5 text-[0.96rem] leading-snug">
                {points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="mt-[0.45em] h-1 w-1 shrink-0 bg-flamedim" aria-hidden />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div>
          <h5 className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-flamehi">
            Сколько стоит подъём
          </h5>
          <p className="mt-1 text-[0.96rem] text-mute">
            Цена считается по значению, <b className="text-parch">к которому</b> ты поднимаешь характеристику.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-[0.96rem]">
              <thead>
                <tr className="border-b border-line text-mute">
                  <th className="py-2 pr-3 font-normal">Целевое значение</th>
                  <th className="py-2 pr-3 font-normal">СИЛ</th>
                  <th className="py-2 pr-3 font-normal">ЛОВ</th>
                  <th className="py-2 font-normal">ИНТ</th>
                </tr>
              </thead>
              <tbody>
                {COST_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-line/50">
                    <td className="py-2 pr-3 font-mono text-parch">{row.label}</td>
                    {(["str", "agi", "int"] as StatKey[]).map((stat) => (
                      <td key={stat} className="py-2 pr-3 font-mono text-flamehi">
                        {statPointCost(stat, row.target - 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Note>
          На <b className="text-flamehi">5 уровне героя</b> выбирается основной архетип.
          На значениях <b className="text-flamehi">5 и 10</b> каждой характеристики открывается рубеж:
          один выбор из двух усилений. Можно усилить свой путь или взять черту соседнего архетипа.
          Подробные описания — в разделе «Архетипы и рубежи» ниже.
        </Note>
      </GuideSection>

      {/* 02 — качество и изношенность */}
      <GuideSection id="guide-gear" step="02" title="Снаряжение: качество и износ">
        <p>
          У каждой вещи три независимых свойства: <b className="text-flamehi">качество</b> добавляет эффекты,
          <b className="text-flamehi"> изношенность</b> меняет базовые характеристики,
          <b className="text-flamehi"> уровень</b> усиливает и то, и другое.
          Сравнивай вещи в арсенале: надетые вещи слева, свободные — справа; кнопка «Подробнее» открывает полный разбор.
        </p>

        <div>
          <h5 className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-flamehi">Качество</h5>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {QUALITY_ROWS.map(({ tier, text }) => (
              <div key={tier} className="border border-line bg-black/30 p-3">
                <RarityBadge tier={tier} />
                <p className="mt-2 text-[0.96rem] leading-snug">{text}</p>
                <p className="mt-1 font-mono text-[0.82rem] text-mute">{RARITY_META[tier].name}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[0.95rem] text-mute">
            Рамки карточек повторяют качество: обычная, сине-голубая, фиолетовая, золотая.
            До исследования качество скрыто.
          </p>
        </div>

        <div>
          <h5 className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-flamehi">Изношенность</h5>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-left text-[0.96rem]">
              <thead>
                <tr className="border-b border-line text-mute">
                  <th className="py-2 pr-3 font-normal">Состояние</th>
                  <th className="py-2 pr-3 font-normal">Множитель</th>
                  <th className="py-2 font-normal">Что это значит</th>
                </tr>
              </thead>
              <tbody>
                {WEAR_ROWS.map(({ tier, text }) => (
                  <tr key={tier} className="border-b border-line/50 align-top">
                    <td className="py-2 pr-3">
                      <Tag tone={tier === "new" ? "verd" : tier === "battered" ? "rubric" : "mute"}>
                        {WEAR_META[tier].name}
                      </Tag>
                    </td>
                    <td className="py-2 pr-3 font-mono text-flamehi">×{WEAR_META[tier].mult.toFixed(2)}</td>
                    <td className="py-2 text-parch/85">{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[0.95rem] text-mute">
            Это базовые множители: у конкретного экземпляра есть небольшой разброс, точные числа видны в «Подробнее».
            Изношенность не тратится от ударов — это состояние вещи при находке или покупке.
          </p>
        </div>

        <Note>
          <b className="text-flamehi">Уровень предмета</b> — от 1 до 10. Каждый уровень усиливает характеристики и эффекты
          примерно на 20% с округлением вверх. Надеть вещь можно, если уровень героя не ниже уровня предмета
          и набрана нужная характеристика. В кузнице качество, состояние и уровень можно улучшить,
          но неудачная попытка может уничтожить предмет.
        </Note>

        <div className="flex flex-wrap gap-2">
          <Btn tone="flame" onClick={onOpenArmory}>
            <Shield size={14} className="mr-1.5 inline" aria-hidden />
            Открыть арсенал
          </Btn>
          <Btn onClick={onOpenShop}>
            <Store size={14} className="mr-1.5 inline" aria-hidden />
            Открыть лавку
          </Btn>
        </div>
      </GuideSection>

      {/* 03 — правила боя */}
      <GuideSection id="guide-combat" step="03" title="Правила боя">
        <p>
          Бой пошаговый. В раунде у каждой стороны есть <b className="text-flamehi">ходы</b>:
          у кого их больше, тот действует раньше и чаще. Одно действие — один ход.
          Маны нет: приёмы уходят на перезарядку, свитки и расходники тратятся.
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="border border-line bg-black/30 p-4">
            <h5 className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-flamehi">Что можно сделать</h5>
            <ul className="mt-2 space-y-2 text-[0.96rem] leading-snug">
              {COMBAT_ACTIONS.map((action) => (
                <li key={action.name}>
                  <b className="text-parch">{action.name}.</b> {action.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-line bg-black/30 p-4">
            <h5 className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-flamehi">Как считается урон</h5>
            <ul className="mt-2 space-y-2 text-[0.96rem] leading-snug">
              <li><b className="text-parch">Оружие.</b> Бросок урона + бонус Силы + эффекты; из физического урона вычитается броня врага.</li>
              <li><b className="text-parch">Магия и чистый урон.</b> Игнорируют броню.</li>
              <li><b className="text-parch">Крит.</b> Обычно умножает урон на 2; шанс и силу можно повысить эффектами.</li>
              <li><b className="text-parch">Уклонение.</b> Полностью отменяет удар.</li>
              <li><b className="text-parch">Стойкость.</b> Снижает шанс получить рану, проклятие, яд или оглушение.</li>
            </ul>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="border border-flamedim/50 bg-black/30 p-4">
            <h5 className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-flamehi">Особые правила</h5>
            <ul className="mt-2 space-y-2 text-[0.96rem] leading-snug">
              <li>
                <b className="text-parch">Мульти-удар.</b> Несколько обычных атак без бонуса приёма;
                каждая отдельно бросает крит, оглушение и эффекты от удара.
              </li>
              <li>
                <b className="text-parch">Дополнительные ходы от снаряжения.</b> Работают только в первом раунде:
                уровень 3–5 даёт до +1, 6–10 — до +2, легендарный предмет 10 уровня — до +3.
              </li>
              <li>
                <b className="text-parch">Расходники.</b> Считаются от Ловкости; свитки дополнительно требуют Интеллект для чтения.
              </li>
            </ul>
          </div>
          <div className="border border-rubric/50 bg-black/30 p-4">
            <h5 className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-rubric">Боссы и катастрофы</h5>
            <ul className="mt-2 space-y-2 text-[0.96rem] leading-snug">
              <li>Босс всегда равен уровню этажа и имеет столько эффектов, сколько этаж.</li>
              <li>У босса 25% сопротивления эффектам; плашка угрозы не показывается — только «Босс».</li>
              <li>
                Печати босса запрещают один тип действия в следующий ход игрока: удар, приёмы или расходники.
                Защита и побег остаются доступны.
              </li>
              <li>Катастрофы тоже получают эффекты от своего уровня.</li>
            </ul>
          </div>
        </div>

        <div>
          <h5 className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-flamehi">Частые эффекты</h5>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {STATUS_ROWS.map((row) => (
              <div key={row.name} className="flex flex-wrap items-baseline gap-x-2 border-b border-line/40 py-1.5 text-[0.95rem]">
                <span className="font-display uppercase tracking-[0.06em] text-parch">{row.name}</span>
                <span className="text-mute">{row.text}</span>
              </div>
            ))}
          </div>
        </div>

        <Note>
          <b className="text-flamehi">Сводка боя живая:</b> урон, защита, ходы, уклонение, крит и стойкость
          пересчитываются сразу: зачёркнутое старое значение и новое рядом показывают, что изменил эффект.
          Кнопка <b className="text-flamehi">«Способности»</b> у портрета врага открывает кодекс: приёмы, пассивный эффект,
          иммунитеты и возможная добыча.
        </Note>
      </GuideSection>

      {/* Дополнительно — свёрнуто, чтобы не мешать первым трём разделам. */}
      <section id="guide-reference" aria-labelledby="guide-reference-title" className="scroll-mt-6 py-6">
        <h4 id="guide-reference-title" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          Подробности и справочные таблицы
        </h4>
        <p className="mt-1 text-[0.98rem] text-mute">
          Открой нужный раздел, когда освоишься. В игре {foeCount} существ, {gearCount} предметов снаряжения
          и {MAP_EVENTS.length} событий подземелья.
        </p>
        <div className="mt-4 space-y-3">
          <Reference id="guide-map" title="Карта, комнаты и управление">
            <p>
              Первый лабиринт {MIN_SIZE}×{MIN_SIZE}, с этажами стороны растут до {MAX_SIZE}×{MAX_SIZE}.
              Факел освещает текущую клетку и до {TORCH} полей по прямым коридорам; сквозь стены и запертые двери не видно.
              Пройденные клетки остаются на карте тусклым следом.
            </p>
            <p className="flex items-start gap-2">
              <MousePointerClick size={15} className="mt-1 shrink-0 text-flame" aria-hidden />
              <span>
                Кликни любую клетку — герой пойдёт по маршруту. Перед дверью, ловушкой, событием или боем
                путь остановится: можно продолжить или отменить. Стрелки и WASD тоже работают.
              </span>
            </p>
            <p>
              Сундуков: 1–3 этажи — один, 4–7 — два, 8–10 — три. Событий с выбором — одно-два.
              Новая клетка: 60% пусто, 10% ловушка, 20% враг, 10% находка.
              Пройденная клетка: 90% ничего, 10% враг.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-y border-line/70 py-2 font-mono text-[0.88rem] text-mute">
              {stages.map((floor) => (
                <span key={floor}>
                  {floor}-й: <b className="text-parch">{mazeSizeForFloor(floor)}²</b> ·{" "}
                  <b className="text-flame">{chestCountForFloor(floor)}</b> сундук
                </span>
              ))}
            </div>
          </Reference>

          <Reference id="guide-gear-details" title="Снаряжение: слоты, вес и исследование">
            <p>
              Ячеек девять: две руки, шлем, тело, ботинки, наручи, два кольца и оберег.
              Двуручное оружие занимает обе руки; среднее оружие можно взять двумя руками (урон ×1.5 с округлением вверх),
              лёгкое — поставить в выбранную руку. Нож, кинжал и рапира всегда лёгкие.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SLOT_ORDER.map((slot) => (
                <Tag key={slot} tone="mute">{SLOT_META[slot].name}</Tag>
              ))}
            </div>
            <p>
              При одинаковых уровне и состоянии: защита — тяжёлое &gt; среднее &gt; лёгкое;
              здоровье — лёгкое &gt; тяжёлое &gt; среднее; уклонение — среднее &gt; лёгкое &gt; тяжёлое.
              Вес не привязывает вещь к характеристике жёстко: посох лёгкий, но требует Интеллекта.
            </p>
            <p>
              До исследования качество и свойства скрыты. Изучить свою вещь в арсенале можно за Интеллект
              <b className="text-parch"> 1 + уровень предмета</b> (не выше 8) или за золото
              <b className="text-parch"> 20 × уровень предмета</b>. Приёмы оружия открываются Интеллектом:
              обычно 2 на уровнях 1–5, 3 на 6–8 и 4 на 9–10; силовым приёмам нужно на 1 меньше.
            </p>
          </Reference>

          <Reference id="guide-levels" title="Опыт и развитие героя">
            <p>
              Потолка по этажам нет: опыт растёт где угодно. Цена следующего уровня:
              <b className="text-parch"> {Array.from({ length: MAX_LEVEL - 1 }, (_, i) => xpForNextLevel(i + 1)).join(" → ")}</b>.
              За уровень даётся 3 очка характеристик; на 5 уровне выбирается архетип,
              на значениях 5 и 10 каждой характеристики — рубеж.
            </p>
            <p>
              Сила даёт здоровье, урон оружием и стойкость. Ловкость — ходы, силу расходников,
              урон ловкого оружия и шанс обезвредить ловушку. Интеллект открывает приёмы, свитки,
              исследование и рецепты. Уклонение даёт не Ловкость, а снаряжение, эффекты и пассивы (потолок 65%).
            </p>
          </Reference>

          <Reference id="guide-archetypes" title="Архетипы и рубежи">
            <p>
              На 5 уровне героя выбери один из шести архетипов: по два на Силу, Ловкость и Интеллект.
              Рубежи характеристик 5 и 10 дают выбор одного усиления из двух — своего или соседнего архетипа.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ARCHETYPE_ORDER.map((id) => {
                const a = ARCHETYPES[id];
                return (
                  <div key={id} className="border border-line bg-black/30 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">{a.name}</span>
                      <span className="font-mono text-[0.82rem] text-flamedim">{a.stat.toUpperCase()}</span>
                    </div>
                    <p className="mt-1 text-[0.93rem] text-mute">{a.short}</p>
                    <p className="mt-2 text-[0.95rem] leading-snug">{a.desc}</p>
                    <p className="mt-2 border-t border-line/60 pt-2 text-[0.9rem] leading-snug text-parch/80">
                      <b className="text-flame">Рубеж 5:</b> {a.milestone5.name}.{" "}
                      <b className="text-flame">Рубеж 10:</b> {a.milestone10.name}.
                    </p>
                  </div>
                );
              })}
            </div>
          </Reference>

          <Reference id="guide-craft" title="Лавка, алхимия и мастерская">
            <p className="flex items-start gap-2">
              <Store size={15} className="mt-1 shrink-0 text-flame" aria-hidden />
              <span>
                Улучшение лавки стоит <b className="text-parch">250 × текущий уровень</b>.
                Уровень лавки определяет, какие вещи появляются и с каким качеством/износом.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <FlaskConical size={15} className="mt-1 shrink-0 text-flame" aria-hidden />
              <span>
                Реагентов {REAGENTS.length} видов. Все расходники масштабируются от Ловкости;
                только свитки требуют Интеллекта. У припаса есть уровень — минимальный этаж, с которого он выпадает.
                Алхимия варит зелья и свитки, мастерская собирает метательные расходники.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <ScrollText size={15} className="mt-1 shrink-0 text-flame" aria-hidden />
              <span>
                Рецепты покупаются у торговца и остаются навсегда. Создание возможно в лобби при нужном Интеллекте;
                шанс успеха {Math.round((1 - BREW_FAILURE_CHANCE) * 100)}%, при неудаче реагенты сгорают.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Hammer size={15} className="mt-1 shrink-0 text-flame" aria-hidden />
              <span>
                Кузница улучшает качество, изношенность и уровень. Риск уничтожения: качество 25/50/75%,
                изношенность 30/60%, уровень 25%. Золото списывается даже при неудаче.
              </span>
            </p>
          </Reference>

          <Reference id="guide-bestiary" title="Бестиарий, угрозы и добыча">
            <p className="flex items-start gap-2">
              <Skull size={15} className="mt-1 shrink-0 text-flame" aria-hidden />
              <span>
                На этаже N встречаются монстры уровня N−1, N и N+1. Каждый новый уровень усиливает
                здоровье, урон и броню в 1.5 раза, но не число ходов.
              </span>
            </p>
            <p>
              Обычный монстр (80%) даёт стандартную добычу. Ужас (15%) сильнее и оставляет снаряжение чаще.
              Катастрофа (5%) — мини-босс с дополнительными приёмами и эффектами.
              Босс охраняет лестницу и оставляет гарантированный трофей не ниже редкого качества.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(CREATURE_META).map(([id, meta]) => (
                <div key={id} className="border border-line bg-black/30 p-2 text-[0.93rem]">
                  <b className="text-parch">{meta.name}.</b> <span className="text-mute">{meta.note}</span>
                </div>
              ))}
            </div>
            <Btn onClick={onOpenBestiary}>
              <Swords size={14} className="mr-1.5 inline" aria-hidden />
              Открыть бестиарий
            </Btn>
          </Reference>

          <Reference id="guide-events" title="События с выбором">
            <p>
              У каждого события несколько вариантов. Любой исход несёт и дар, и потерю:
              алтарь даст опыт, но возьмёт кровь; монеты из колодца окажутся целыми, но под ними будет жало.
              Шанс удачи показан на кнопке.
            </p>
            <div className="space-y-2">
              {MAP_EVENTS.map((ev) => (
                <details key={ev.id} className="group border border-line bg-black/25">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                    <span className="font-display text-[1.02rem] uppercase tracking-[0.08em] text-flamehi">{ev.name}</span>
                    <ChevronRight size={14} className="text-mute transition-transform group-open:rotate-90" aria-hidden />
                  </summary>
                  <div className="border-t border-line/60 px-3 py-2">
                    <p className="text-[0.93rem] italic text-mute">{ev.prompt}</p>
                    <ul className="mt-2 space-y-1.5 text-[0.92rem]">
                      {ev.choices.map((c) => (
                        <li key={c.id} className="border-l-2 border-flamedim/60 pl-2.5">
                          <b className="text-parch">{c.label}</b>{" "}
                          <span className="font-mono text-[0.84rem] text-verd">удача {Math.round(c.chance * 100)}%</span>
                          <div className="text-mute">
                            удачно: {c.goodText} <span className="text-rubric/80">· иначе: {c.badText}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          </Reference>

          <Reference id="guide-return" title="Выход, смерть и сохранение">
            <p>
              «Покинуть подземелье» сохраняет всю добычу вылазки. Смерть забирает всё найденное на этажах,
              но уровень, характеристики, рецепты, уровень лавки и купленное ранее снаряжение остаются.
              Побег из боя может унести до 70% трофеев текущего похода.
            </p>
            <p>
              Победа над Стражом открывает следующий этаж навсегда: в лобби можно выбрать любой открытый ярус.
              Прогресс сохраняется в браузере; обновление страницы посреди вылазки вернёт к последнему сохранению
              без текущей добычи.
            </p>
          </Reference>
        </div>
        <Rune className="mt-6" />
      </section>
    </article>
  );
}
