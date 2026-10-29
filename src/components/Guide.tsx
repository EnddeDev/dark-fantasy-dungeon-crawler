import { ChevronRight, MousePointerClick, ScrollText, Store } from "lucide-react";
import {
  BREW_FAILURE_CHANCE,
  CREATURE_META,
  ENEMIES,
  GEAR_BASES,
  MAX_LEVEL,
  REAGENTS,
  xpForNextLevel,
} from "../game/content";
import { MAP_EVENTS } from "../game/world";
import { MAX_SIZE, MIN_SIZE, TORCH, chestCountForFloor, mazeSizeForFloor } from "../game/maze";
import { SLOT_META, SLOT_ORDER } from "../game/types";
import { Btn, Rune, Tag } from "./ui";

const stages = [1, 2, 3, 4, 5, 8, 10];

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
      <div className="border-b border-line pb-5">
        <span className="sc text-flamedim">Полевой справочник · издание для живых</span>
        <h3 className="mt-1 font-title text-3xl text-flamehi sm:text-4xl">Как покорить Сумрак</h3>
        <p className="dropcap mt-3 max-w-2xl text-[1.04rem] leading-relaxed text-parch/85">
          Спустись, собери ключи и трофеи, одолей Стража перед лестницей и вернись в лобби живым — только так
          добыча становится твоей. В справочнике {foeCount} существ, {gearCount} предметов снаряжения и{" "}
          {MAP_EVENTS.length} событий подземелья.
        </p>
      </div>

      <section className="border-b border-line py-5" aria-labelledby="guide-map">
        <h4 id="guide-map" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          01 / Карта, комнаты и опасности
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          Первый лабиринт {MIN_SIZE}×{MIN_SIZE}, с каждым этажом стороны растут до {MAX_SIZE}×{MAX_SIZE}. Факел
          освещает текущую клетку и до {TORCH} полей по прямым коридорам — сквозь стены и запертые двери не видно
          ничего. Пройденные клетки остаются на чертеже тусклым следом.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="border border-line bg-black/30 p-3">
            <div className="sc text-flame">Комнаты</div>
            <p className="mt-1 text-[0.96rem] leading-snug text-parch/85">
              Коридоры разбавлены залами, криптами, галереями, ротондами и пилонами — у каждой свой размер и форма,
              часть колонн внутри остаётся замурованной. Комната подписана прямо на чертеже, и она же съедает
              тупики, поэтому сундуки иногда стоят не в нише, а в открытом зале: замок тогда на самой клетке.
            </p>
          </div>
          <div className="border border-line bg-black/30 p-3">
            <div className="sc text-flame">Сундуки и события</div>
            <p className="mt-1 text-[0.96rem] leading-snug text-parch/85">
              Сундуков на этаже ровно столько: 1–3 этажи — <b className="text-parch">один</b>, 4–7 —{" "}
              <b className="text-parch">два</b>, 8–10 — <b className="text-parch">три</b>. Событий с выбором —{" "}
              <b className="text-parch">одно-два</b>, они видны на карте ромбом заранее.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-y border-line/70 py-2.5 font-mono text-[0.88rem] text-mute">
          {stages.map((floor) => (
            <span key={floor}>
              {floor}-й: <b className="text-parch">{mazeSizeForFloor(floor)}²</b> ·{" "}
              <b className="text-flame">{chestCountForFloor(floor)}</b> сундук
            </span>
          ))}
        </div>

        <div className="mt-4 grid gap-4 text-[0.99rem] sm:grid-cols-2">
          <div>
            <span className="sc text-flame">Новая клетка</span>
            <p className="mt-1 leading-relaxed text-parch/85">
              60% пусто, 10% ловушка, 20% враг, 10% небольшая находка: монеты или реагент.
            </p>
          </div>
          <div>
            <span className="sc text-verd">Уже пройденная клетка</span>
            <p className="mt-1 leading-relaxed text-parch/85">
              75% пусто, 5% ловушка, 20% враг. Обратный путь безопаснее, но не безлюден.
            </p>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2 border-l-2 border-flamedim bg-black/25 px-3 py-2 text-[0.96rem] leading-snug text-parch/85">
          <MousePointerClick size={15} className="mt-0.5 shrink-0 text-flame" aria-hidden />
          <span>
            <b className="text-flamehi">Ходьба мышью:</b> кликни любую освещённую клетку — маршрут прочертится
            бегущим штрихом, и персонаж пойдёт сам, шаг за шагом. Путь обрывается перед запертой дверью, ловушкой,
            событием или боем: стрелки и WASD по-прежнему работают.
          </span>
        </p>
      </section>

      <section className="border-b border-line py-5" aria-labelledby="guide-event">
        <h4 id="guide-event" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          02 / События с выбором
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          У каждого события два-три варианта, и <b className="text-flamehi">любой исход несёт и дар, и потерю</b>:
          алтарь даст опыт, но возьмёт кровь; монеты из колодца окажутся целыми, но под ними будет жало. Удача
          выбирается по проценту, показанному на кнопке, — а после выбора карта рассказывает обе стороны.
        </p>
        <div className="mt-3 grid gap-2">
          {MAP_EVENTS.map((ev) => (
            <details key={ev.id} className="group border border-line bg-black/25">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                <span className="font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">{ev.name}</span>
                <ChevronRight size={14} className="text-mute transition-transform group-open:rotate-90" aria-hidden />
              </summary>
              <div className="border-t border-line/60 px-3 py-2">
                <p className="text-[0.94rem] italic text-mute">{ev.prompt}</p>
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
      </section>

      <section className="border-b border-line py-5" aria-labelledby="guide-level">
        <h4 id="guide-level" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          03 / Опыт и развитие
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          Старт: по 1 Силе, Ловкости и Интеллекту и 4 свободных очка. За новый уровень — ещё 2 очка. До значения 5
          повышение стоит 1 очко, после — 2. На значениях 5 и 10 выбери по одной пассивной способности из двух.
          Максимальный уровень персонажа — {MAX_LEVEL}.
        </p>
        <div className="mt-3 border-l-2 border-flamedim bg-black/30 px-3 py-2.5 text-[0.97rem] leading-relaxed text-parch/90">
          Потолка по этажам нет: уровень растёт где угодно. Но опыт с монстров мал, а цена уровня растёт (
          {Array.from({ length: MAX_LEVEL - 1 }, (_, i) => xpForNextLevel(i + 1)).join(" → ")}). Первые уровни
          приходят за несколько боёв, поздние — за десятки вылазок, и чем глубже этаж, тем больше заходов нужно.
        </div>
        <p className="mt-3 text-[0.96rem] leading-relaxed text-mute">
          Сила даёт здоровье, урон и стойкость к эффектам. Ловкость — ходы в раунде, уклонение и урон быстрых
          клинков. Интеллект открывает приёмы оружия, чтение свитков, бесплатное исследование снаряжения и алхимию.
        </p>
      </section>

      <section className="border-b border-line py-5" aria-labelledby="guide-threat">
        <h4 id="guide-threat" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          04 / Уровни и угрозы монстров
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          На этаже N встречаются монстры уровня N−1 (20%), N (55%) и N+1 (25%); на первом этаже возможен уровень 0.
          Уровень поднимает здоровье, урон, броню и качество добычи: каждый уровень выше этажа переносит по 1 п.п.
          из «ничего» в золото, реагенты, припасы и снаряжение.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="border border-line bg-black/30 p-3">
            <div className="sc text-verd">Обычный · 80%</div>
            <p className="mt-1 text-[0.94rem] leading-snug text-parch/85">
              Стандартная угроза этажа. Дроп по общим правилам: 30% ничего, 30% золото, 20% реагенты, 15% припасы,
              5% снаряжение.
            </p>
          </div>
          <div className="border border-flamedim/60 bg-black/30 p-3">
            <div className="sc text-flame">Ужас · 15%</div>
            <p className="mt-1 text-[0.94rem] leading-snug text-parch/85">
              Здоровье и урон заметно выше, есть дополнительный приём. Пустых рук не оставляет: вся доля «ничего»
              уходит в снаряжение (≈35%).
            </p>
          </div>
          <div className="border border-rubric/60 bg-black/30 p-3">
            <div className="sc text-rubric">Катастрофа · 5%</div>
            <p className="mt-1 text-[0.94rem] leading-snug text-parch/85">
              Мини-босс: не меньше двух особых приёмов и пассивный эффект — каменная шкура, регенерация, яд или
              исступление. Снаряжение падает чаще половины случаев.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[0.96rem] leading-relaxed text-parch/85">
          Редкость снаряжения: 60% обычное, 30% редкое, 8% эпическое, 2% легендарное. Ужас, катастрофа и уровень
          выше этажа поднимают шансы редкого и выше. Приёмы врагов — яд, двойной выпад, насмешка с заслоном,
          похищение жизни, раскол брони, оглушающий звон — описаны в кодексе прямо во время боя.
        </p>
        <div className="mt-3">
          <Btn onClick={onOpenBestiary}>Открыть бестиарий и расчёт добычи</Btn>
        </div>
      </section>

      <section className="border-b border-line py-5" aria-labelledby="guide-fight">
        <h4 id="guide-fight" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          05 / Бой: очередь, сводка и эффекты
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          Ходов больше — действуешь раньше. В ленте вверху показаны сами числа ходов: твой следующий ход подсвечен
          и увеличен. Маны нет: свитки расходуются, приёмы оружия уходят на перезарядку.
        </p>
        <div className="mt-3 border border-flamedim/50 bg-black/30 p-3 text-[0.96rem] leading-relaxed text-parch/85">
          <b className="text-flamehi">Сводка боя живая.</b> Урон, защита, входящий урон, число ходов, уклонение,
          крит и стойкость пересчитываются сразу: зачёркнутое старое значение и новое рядом показывают, что именно
          изменил эффект. Проклятие честно пишет «−30% к урону» в числах, ярость — «×1.5», каменная кожа — «−30%
          входящего», раскол брони — минус к защите. Под сводкой список всех действующих эффектов с остатком
          раундов; как только эффект спадает, числа возвращаются к чистым.
        </div>
        <div className="mt-3 space-y-2 border-y border-line/70 py-3">
          {Object.entries(CREATURE_META).map(([id, meta]) => (
            <div key={id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.95rem]">
              <span className="min-w-25 font-display uppercase tracking-[0.1em] text-flamehi">{meta.name}</span>
              <span className="text-mute">{meta.note}</span>
              {id === "undead" && <Tag tone="rubric">яд и страх не действуют</Tag>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.96rem] text-parch/85">
          Кнопка <b className="text-flamehi">«Способности»</b> у портрета врага открывает кодекс на полях справа:
          что он делает каждым приёмом, его пассивный эффект, что на него действует и что он оставит после себя.
        </p>
      </section>

      <section className="border-b border-line py-5" aria-labelledby="guide-gear">
        <h4 id="guide-gear" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          06 / Снаряжение: слоты, уровни, качество
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          Ячеек девять: <b className="text-flamehi">две руки</b> (двуручное оружие занимает обе, иначе оружие + щит
          или кинжал), <b className="text-flamehi">шлем</b>, <b className="text-flamehi">тело</b>,{" "}
          <b className="text-flamehi">ботинки</b>, <b className="text-flamehi">наручи</b>,{" "}
          <b className="text-flamehi">два кольца</b> и <b className="text-flamehi">оберег</b>. Менять снаряжение
          можно в арсенале: надетые вещи слева, свободный инвентарь справа. Кнопка «Подробнее» открывает
          полный разбор предмета. В походе снаряжение также можно сменить на панели карты.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SLOT_ORDER.map((slot) => (
            <Tag key={slot} tone="mute">
              {SLOT_META[slot].name}
            </Tag>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="border border-line bg-black/30 p-3">
            <div className="sc text-flame">Вес и характеристика</div>
            <p className="mt-1 text-[0.94rem] leading-snug text-parch/85">
              Лёгкое, среднее и тяжёлое — это вес и габарит, а не жёсткая привязка к статистике.
              Нож, кинжал и рапира всегда лёгкие и зависят от Ловкости; посох лёгкий, но от Интеллекта;
              меч средний и силовой, топор и молот тяжёлые. Кольчуга и открытый шлем средние,
              латы и закрытый шлем тяжёлые, ткань и украшения лёгкие.
            </p>
          </div>
          <div className="border border-line bg-black/30 p-3">
            <div className="sc text-flame">Уровень предмета</div>
            <p className="mt-1 text-[0.94rem] leading-snug text-parch/85">
              От 1 до 10. Чем выше уровень, тем выше характеристики, тем дороже вещь и тем сложнее её исследовать:
              нужен Интеллект <b>1 + уровень</b> либо золото <b>20 × уровень</b>. В лавку попадает только
              снаряжение не выше уровня самой лавки.
            </p>
          </div>
          <div className="border border-line bg-black/30 p-3">
            <div className="sc text-flame">Изношенность</div>
            <p className="mt-1 text-[0.94rem] leading-snug text-parch/85">
              Новое ×1.25 к параметрам, ношенное ×1, изношенное ×0.75. Плюс у каждого экземпляра свой разброс:
              клинок может бить 3–5 или 2–7, а параметры брони и украшений отличаются на ±10%.
            </p>
          </div>
          <div className="border border-line bg-black/30 p-3">
            <div className="sc text-flame">Качество наследуется</div>
            <p className="mt-1 text-[0.94rem] leading-snug text-parch/85">
              Обычное — только база и приём. Редкое — плюс один параметр. Эпическое — редкое свойство и активная
              способность. Легендарное — оба предыдущих и уникальный пассив. Рамки: обычная, сине-голубая,
              фиолетовая, золотая.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[0.96rem] leading-relaxed text-parch/85">
          Одно и то же оружие встречается с разными приёмами: рапира может нести «Фехтование», «Обезоруживающий
          выпад» или «Стойку дуэлянта». Приём открывается Интеллектом и даёт пассивную прибавку к обычным ударам.
          Редкость до исследования скрыта — изучать можно только свою вещь в арсенале, за Интеллект или золото.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn tone="flame" onClick={onOpenShop}>
            <Store size={14} className="mr-1.5 inline" aria-hidden />
            Открыть лавку
          </Btn>
          <Btn onClick={onOpenArmory}>Посмотреть арсенал</Btn>
        </div>
      </section>

      <section className="border-b border-line py-5" aria-labelledby="guide-shop">
        <h4 id="guide-shop" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          07 / Лавка: 10 уровней
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          Вложение золота поднимает уровень лавки (250 зол. за второй, 500 за третий и так далее — цена равна
          250 × текущий уровень). Уровень решает две вещи: какие предметы появляются на прилавке и с какими
          изношенностью и редкостью.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="border border-line bg-black/30 p-3">
            <div className="sc text-flame">Уровень 1</div>
            <p className="mt-1 font-mono text-[0.92rem] text-parch/85">
              изношенность: новое <b className="text-verd">5%</b> · ношеное <b>25%</b> · изношенное{" "}
              <b className="text-rubric">70%</b>
            </p>
            <p className="mt-1 font-mono text-[0.92rem] text-parch/85">
              качество: обычное <b>80%</b> · редкое <b className="text-verd">15%</b> · эпическое{" "}
              <b className="text-flame">5%</b> · легендарное <b className="text-rubric">0%</b>
            </p>
          </div>
          <div className="border border-flamedim/60 bg-black/30 p-3">
            <div className="sc text-flamehi">Уровень 10</div>
            <p className="mt-1 font-mono text-[0.92rem] text-parch/85">
              изношенность: новое <b className="text-verd">40%</b> · ношеное <b>60%</b> · изношенное{" "}
              <b className="text-rubric">0%</b>
            </p>
            <p className="mt-1 font-mono text-[0.92rem] text-parch/85">
              качество: обычное <b>40%</b> · редкое <b className="text-verd">25%</b> · эпическое{" "}
              <b className="text-flame">20%</b> · легендарное <b className="text-rubric">15%</b>
            </p>
          </div>
        </div>
        <p className="mt-3 text-[0.96rem] leading-relaxed text-mute">
          Между уровнями значения меняются плавно, и обе таблицы видны в самой лавке — там же полосами показано,
          что именно даст следующий уровень.
        </p>
      </section>

      <section className="border-b border-line py-5" aria-labelledby="guide-brew">
        <h4 id="guide-brew" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          08 / Реагенты, припасы и алхимия
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          Реагенты живут отдельным отделом лавки и отдельной строкой в рюкзаке: порох, ткань, растения, части
          тварей. Всего {REAGENTS.length} видов — от кровавого мха и слёз банши до шёлка паука, железы слизи и
          угля с дна.
        </p>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          Припасы стали разнообразнее: зелье скорости даёт +1 ход на 3 раунда, свиток ужаса заставляет врага держать
          защиту 2 хода, свиток оков и световая бомба отнимают ходы, флакон кислоты бьёт сквозь броню и раскалывает
          её, святая вода вдвое сильнее по нежити, зелье каменной кожи режет входящий урон на 30%. Метательное
          оружие и метательные расходники считаются от Ловкости и не требуют Интеллекта;
          только свитки требуют Интеллекта и усиливаются им. Зелья дают фиксированный эффект.
        </p>
        <p className="mt-2 flex items-start gap-2 text-[1rem] leading-relaxed text-parch/85">
          <ScrollText size={15} className="mt-0.5 shrink-0 text-flame" aria-hidden />
          <span>
            Рецепты нельзя угадать: сначала купи лист у торговца — он останется в книге навсегда. Варка возможна
            только в лобби и при нужном Интеллекте; шанс успеха{" "}
            {Math.round((1 - BREW_FAILURE_CHANCE) * 100)}%, а в остальных случаях реагенты сгорают без результата.
          </span>
        </p>
      </section>

      <section className="py-5" aria-labelledby="guide-return">
        <h4 id="guide-return" className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">
          09 / Выход и новый спуск
        </h4>
        <p className="mt-2 text-[1rem] leading-relaxed text-parch/85">
          «Покинуть подземелье» сохраняет всю добычу вылазки. Смерть забирает всё найденное на этажах, но уровень,
          характеристики, знания рецептов, уровень лавки и купленное ранее снаряжение остаются. Побег из боя уносит
          до 70% трофеев. Победа над Стражом открывает следующий этаж навсегда: в лобби можно выбрать любой
          открытый ярус и начать сразу с него.
        </p>
        <p className="mt-2 text-[0.94rem] italic text-mute">
          Возвращение в лобби сохраняет прогресс в браузере. Обновление страницы посреди вылазки вернёт к
          последнему сохранению без текущей добычи — это цена риска.
        </p>
        <Rune className="mt-5" />
      </section>
    </article>
  );
}
