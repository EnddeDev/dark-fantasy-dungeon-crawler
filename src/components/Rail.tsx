import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useFitInViewport } from "./useFitInViewport";
import { Activity, Coins, LogOut, Pencil, Sparkles } from "lucide-react";
import {
  LEGENDARY_PASSIVES,
  MAX_LEVEL,
  RARE_AFFIXES,
  legendaryPassiveDesc,
  rareAffixDesc,
  STAT_META,
  STAT_ORDER,
  xpForNextLevel,
} from "../game/content";
import { GEAR_PASSIVES, effectShortValue, passiveDetail } from "../game/gearEffects";
import { gearEffectTotals } from "../game/gearEffectTotals";
import { combatReadout, derived, equippedList, techniqueSkillScale, type BattleState } from "../game/battle";
import type { GearItem, Player, Run } from "../game/types";
import { Btn, Meter } from "./ui";
import { StatBadge } from "./StatBadge";
import { MetricBadge, tipAlignForColumn } from "./MetricBadge";
import { isBattleCurse } from "../game/traps";
import { CHARACTER_NAME_MAX } from "../game/characterName";

type EffectEntry = {
  id: string;
  title: string;
  detail: string;
  /** Короткое значение для карточки, например «14%». */
  value?: string;
  badge?: string;
  negative?: boolean;
  /** Вклад каждого предмета: показывается во всплывающем окне при наведении. */
  breakdown?: { name: string; level?: number; detail: string }[];
  note?: string;
};

/** Всплывающее окно записи: итог и вклад каждого предмета. */
export function EffectTip({ id, entry }: { id: string; entry: EffectEntry }) {
  const tipRef = useRef<HTMLDivElement>(null);
  useFitInViewport(tipRef, true);
  if (!entry.breakdown) return null;
  return (
    <div
      ref={tipRef}
      role="tooltip"
      id={id}
      className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-[min(19rem,72vw)] border border-flamedim bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
    >
      <div className="font-display text-[0.95rem] uppercase tracking-[0.06em] text-flamehi">{entry.title}</div>
      <p className="mt-1.5 text-[0.86rem] leading-snug text-parch/90">Итог: {entry.detail}</p>
      <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.84rem] text-mute">От предметов:</p>
      <ul className="mt-1 space-y-1">
        {entry.breakdown.map((part, i) => (
          <li key={i} className="text-[0.86rem] leading-snug text-parch/90">
            <span className="text-flamehi">{part.name}</span>
            {part.level ? <span className="text-mute"> · ур. {part.level}</span> : null}: {part.detail}
          </li>
        ))}
      </ul>
      {entry.note && <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.84rem] leading-snug text-mute">{entry.note}</p>}
    </div>
  );
}

/** Числовые эффекты суммируются по всем надетым исследованным вещам; подсказка показывает вклад каждой. */
export function summedEffectEntries(worn: GearItem[]): EffectEntry[] {
  return gearEffectTotals(worn).map((total) => ({
    id: `effect-${total.id}`,
    title: total.name,
    detail: total.detail,
    value: effectShortValue(total.id, total.total),
    breakdown: total.sources.map((s) => ({ name: s.name, level: s.level, detail: s.detail })),
    note: total.stacking === "max" ? "Дополнительные ходы не складываются: действует наибольшее значение, не больше 3." : undefined,
  }));
}

/** Запись со всплывающим окном: итог, вклад каждого предмета и примечание. */
function EffectCard({ entry }: { entry: EffectEntry }) {
  const [open, setOpen] = useState(false);
  const tipId = `effect-tip-${entry.id}`;
  const card = (
    <div className={`border-l-2 bg-black/20 py-2 pl-3 pr-2 ${entry.negative ? "border-rubric/70" : "border-flamedim/70"}`}>
      <h4 className={`font-display text-[1.05rem] uppercase leading-snug tracking-[0.05em] ${entry.negative ? "text-rubric" : "text-flamehi"}`}>
        {entry.value ? `${entry.title}: ${entry.value}` : entry.title}
      </h4>
    </div>
  );
  if (!entry.breakdown) return card;
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        tabIndex={0}
        role="button"
        aria-describedby={open ? tipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="cursor-help focus:outline-none focus-visible:ring-1 focus-visible:ring-flame"
      >
        {card}
      </div>
      {open && (
        <EffectTip id={tipId} entry={entry} />
      )}
    </div>
  );
}

export function EffectList({ entries, empty }: { entries: EffectEntry[]; empty: string }) {
  if (!entries.length) return <p className="text-[0.98rem] leading-relaxed text-mute">{empty}</p>;

  return (
    <div className="space-y-2.5">
      {entries.map((entry) => (
        <EffectCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <h3 className="sc mb-3 text-[0.87rem] text-flamedim">{title}</h3>
      {children}
    </section>
  );
}

/** Раздел, который раскрывается по нажатию. По умолчанию свёрнут. */
function FoldSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="sc flex w-full items-center justify-between text-left text-[0.87rem] text-flamedim transition-colors hover:text-flamehi"
      >
        <span>{title}</span>
        <span className="font-mono text-[0.8rem] normal-case tracking-normal text-mute">{open ? "Свернуть" : "Развернуть"}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Панель персонажа: характеристики и эффекты; смена вещей находится в арсенале. */
export function Rail({
  player,
  run,
  battle,
  onLeaveRun,
  onRename,
  lobby = false,
}: {
  player: Player;
  run: Run | null;
  battle: BattleState | null;
  onLeaveRun?: () => void;
  /** Возвращает текст ошибки или null, если имя принято. */
  onRename?: (name: string) => string | null;
  /** В лобби над панелью есть верхняя полоса: панель прилипает ниже неё. */
  lobby?: boolean;
}) {
  const [section, setSection] = useState<"stats" | "effects">("stats");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const startRename = () => {
    setDraftName(player.name);
    setNameError(null);
    setRenaming(true);
  };
  const cancelRename = () => {
    setRenaming(false);
    setNameError(null);
  };
  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    const error = onRename?.(draftName) ?? null;
    if (error) {
      setNameError(error);
      return;
    }
    setRenaming(false);
    setNameError(null);
  };
  const d = derived(player);
  const readout = battle ? combatReadout(battle) : null;
  const flatDamage = d.strFlat + (player.passives.includes("heavy_hand") ? 3 : 0) + d.rareAffixes.filter((id) => id === "might").length * 3;
  const damage: [number, number] = readout ? [readout.dmgMin, readout.dmgMax] : [d.hit[0] + flatDamage, d.hit[1] + flatDamage];
  /* Множитель приёма: в бою берём значения боя (с учётом эффектов и предметов), вне боя — текущие данные героя. */
  const techWs = battle ? battle.p.weaponSkill : d.weaponSkill;
  const techSkillScale = battle
    ? techniqueSkillScale(battle.p.effectPower, battle.p.passives)
    : techniqueSkillScale(d.effectPower, player.passives);
  const armor = readout?.armor ?? d.armor;
  const ap = readout?.ap ?? d.ap;
  const stamina = readout?.staminaMax ?? d.staminaMax;
  const resist = readout?.resist ?? d.tenacity;
  const xpNeed = xpForNextLevel(player.level);
  const statuses = battle ? battle.p.statuses : player.statuses;
  const worn = equippedList(player).filter((item) => item.identified);

  /* Свойства группируем по типу: одна строка на каждое свойство. */
  const gearEffects = new Map<string, EffectEntry>();
  const addGearEffect = (id: string, title: string, detail: string) => {
    if (!gearEffects.has(id)) gearEffects.set(id, { id, title, detail });
  };
  worn.forEach((item) => {
    if (item.passive) {
      const passive = GEAR_PASSIVES[item.passive];
      if (passive) addGearEffect(`passive-${item.passive}`, passive.name, passiveDetail(item.passive, item.level ?? 1));
    }
    if (item.rareAffix) {
      const affix = RARE_AFFIXES[item.rareAffix];
      addGearEffect(`affix-${item.rareAffix}`, affix.name, rareAffixDesc(item.rareAffix, item.level ?? 1));
    }
    if (item.legendaryPassive) {
      const passive = LEGENDARY_PASSIVES[item.legendaryPassive];
      addGearEffect(`legendary-${item.legendaryPassive}`, passive.name, legendaryPassiveDesc(item.legendaryPassive, item.level ?? 1));
    }
  });
  const gearEntries: EffectEntry[] = [...summedEffectEntries(worn), ...gearEffects.values()];

  const current: EffectEntry[] = readout
    ? [...readout.dmgMods, ...readout.defMods].map((mod) => ({
        id: `current-${mod.id}`,
        title: mod.label,
        detail: mod.detail,
        badge: mod.rounds ? `Осталось: ${mod.rounds}` : "В этом бою",
        negative: !mod.good,
      }))
    : [
        ...(statuses.wound > 0 && !d.legendaryPassives.includes("titan_heart") ? [{ id: "wound", title: "Кровотечение", detail: `На каждом шаге отнимает ${statuses.woundTick ?? 0} здоровья.`, badge: `Осталось: ${statuses.wound}`, negative: true }] : []),
        ...(statuses.poison > 0 && !d.legendaryPassives.includes("titan_heart") ? [{ id: "poison", title: "Отравление", detail: `На каждом шаге отнимает ${statuses.poisonTick ?? 0} здоровья.`, badge: `Осталось: ${statuses.poison}`, negative: true }] : []),
        ...(statuses.curse > 0 ? [{ id: "curse", title: "Проклятие", detail: `В бою наносимый урон снижен на ${statuses.cursePower ?? 30}%.`, badge: isBattleCurse(statuses.curse) ? "До конца боя" : `Осталось: ${statuses.curse}`, negative: true }] : []),
      ];
  if (battle && battle.p.statuses.haste > 0) current.push({
    id: "haste", title: "Ускорение", detail: "+1 ход в каждом раунде, пока действует зелье.", badge: `Раундов: ${battle.p.statuses.haste}`,
  });
  if (d.legendaryPassives.includes("titan_heart") && (statuses.wound > 0 || statuses.poison > 0)) {
    current.push({ id: "titan-immunity", title: "Сердце колосса", detail: "Иммунитет к периодическому урону от кровотечения и яда." });
  }

  const hpNow = battle ? battle.p.hp : player.hp;
  const hpMax = battle ? battle.p.maxHp : d.maxHp;
  /* Короткий список для панели над опытом: только то, что вредит. */
  const negativeEffects = current.filter((entry) => entry.negative);

  const unknownCount = equippedList(player).filter((item) => !item.identified).length;

  return (
    <aside
      className={`order-1 min-w-0 shrink-0 border-b border-line bg-slab lg:sticky lg:w-[350px] lg:border-b-0 lg:border-r xl:w-[380px] ${
        lobby ? "lg:top-14 lg:h-[calc(100dvh-3.5rem)]" : "lg:top-0 lg:h-dvh"
      }`}
      aria-label="Персонаж"
    >
      <div className="lg:flex lg:h-full lg:flex-col">
        {/* Кошелёк не уезжает при прокрутке характеристик и эффектов. */}
        <div className="sticky top-0 z-20 shrink-0 border-b border-flamedim/40 bg-slab px-4 py-3 shadow-[0_6px_18px_-12px_#000]" aria-label="Кошель персонажа">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-mute"><Coins size={18} className="text-flame" aria-hidden /> Кошель</span>
            <span className="font-mono text-2xl leading-none tab text-flamehi">{player.gold}<span className="ml-1.5 text-xs text-mute">зол.</span></span>
          </div>
          {run && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-[0.92rem]">
              <span className="text-mute">Под риском в вылазке</span>
              <span className="font-mono tab text-flame">+{run.gold} зол.</span>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex w-full items-center justify-between border-b border-line px-4 py-2.5 text-left font-display text-[1rem] uppercase tracking-[0.08em] text-flamehi lg:hidden"
        >
          Персонаж <span className="font-mono text-[0.86rem] normal-case tracking-normal text-mute">{mobileOpen ? "Свернуть" : "Развернуть"}</span>
        </button>

        <div className={`${mobileOpen ? "block" : "hidden"} min-h-0 flex-1 lg:block lg:overflow-y-auto`}>
          <header className="border-b border-line px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {renaming ? (
                <form onSubmit={submitRename} className="min-w-0 flex-1" aria-label="Смена имени персонажа">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={draftName}
                      maxLength={CHARACTER_NAME_MAX}
                      onChange={(e) => {
                        setDraftName(e.target.value);
                        setNameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelRename();
                      }}
                      aria-label="Имя персонажа"
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={nameError ? "rail-name-error" : undefined}
                      className="min-w-0 flex-1 border border-flamedim bg-black/30 px-2 py-1 font-title text-[1.4rem] leading-tight text-flamehi outline-none focus:border-flame"
                    />
                    <button type="submit" className="border border-flamedim px-2 py-1 font-display text-[0.8rem] uppercase tracking-[0.08em] text-flamehi hover:border-flame hover:bg-flame/15">
                      Сохранить
                    </button>
                    <button type="button" onClick={cancelRename} className="px-1 py-1 font-display text-[0.8rem] uppercase tracking-[0.08em] text-mute hover:text-parch">
                      Отмена
                    </button>
                  </div>
                  {nameError && (
                    <p id="rail-name-error" role="alert" className="mt-1 text-[0.85rem] text-rubric">
                      {nameError}
                    </p>
                  )}
                </form>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate font-title text-[1.85rem] leading-tight text-flamehi">{player.name}</h2>
                  {onRename && (
                    <button
                      type="button"
                      onClick={startRename}
                      aria-label="Сменить имя персонажа"
                      title="Сменить имя персонажа"
                      className="shrink-0 border border-transparent p-1 text-mute hover:border-flamedim hover:text-flamehi"
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                  )}
                </div>
              )}
              <span className="font-mono text-sm text-flame">Ур. {player.level}/{MAX_LEVEL}</span>
            </div>
            {/* Порядок по правилам экрана: здоровье, под ним негативные эффекты, затем опыт. */}
            <div className="mt-3" aria-label="Здоровье">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.94rem] text-mute">Здоровье</span>
                <span className="font-mono text-[0.92rem] tab text-parch">
                  {hpNow} / {hpMax}
                </span>
              </div>
              <Meter value={hpNow} max={hpMax} tone="rubric" className="mt-1 h-2" ticks={8} />
            </div>

            {negativeEffects.length > 0 && (
              <div className="mt-3" aria-label="Негативные эффекты">
                <div className="sc mb-1.5 text-[0.84rem] text-rubric">Негативные эффекты</div>
                <ul className="space-y-1">
                  {negativeEffects.map((entry) => (
                    <li key={entry.id} className="flex items-baseline justify-between gap-2 border-l-2 border-rubric/70 bg-black/20 py-1 pl-2 pr-1.5">
                      <span className="font-display text-[0.95rem] uppercase tracking-[0.04em] text-rubric">{entry.title}</span>
                      {entry.badge && <span className="font-mono text-[0.82rem] text-mute">{entry.badge}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
              <span className="mt-1 text-[0.94rem] text-mute">Опыт</span>
              <span className="mt-1 font-mono text-[0.92rem] tab text-parch">
                {player.level >= MAX_LEVEL ? "МАКС" : `${player.xp} / ${xpNeed}`}
              </span>
              <Meter value={player.level >= MAX_LEVEL ? 1 : player.xp} max={player.level >= MAX_LEVEL ? 1 : xpNeed} tone="flame" className="col-span-2 h-1.5" ticks={8} />
            </div>
          </header>

          {run && (
            <div className="border-b border-line bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.92rem] text-mute">
                <span>Этаж <b className="font-mono text-parch">{run.floor}</b></span>
                <span>Ключи <b className="font-mono text-parch">{run.keys}</b></span>
                <span>Трофеи <b className="font-mono text-parch">{run.loot.length + run.gearLoot.length}</b></span>
              </div>
              {!battle && onLeaveRun && (
                <Btn tone="danger" className="mt-3 w-full gap-2 px-3 py-2.5" onClick={onLeaveRun}>
                  <LogOut size={14} aria-hidden /> Сохранить добычу и выйти
                </Btn>
              )}
              <p className="mt-2 text-[0.89rem] leading-snug text-mute">Добыча станет вашей только после выхода. При поражении она теряется.</p>
            </div>
          )}

          <div className="grid grid-cols-2 border-b border-line bg-black/20 p-1.5" role="group" aria-label="Раздел персонажа">
            {([
              ["stats", "Характеристики", Activity],
              ["effects", "Эффекты", Sparkles],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={section === id}
                onClick={() => setSection(id)}
                className={`flex items-center justify-center gap-2 px-2 py-2.5 font-display text-[0.98rem] tracking-[0.03em] transition-colors ${section === id ? "bg-slab2 text-flamehi shadow-[inset_0_-1px_0_#e0a33c]" : "text-mute hover:text-parch"}`}
              >
                <Icon size={15} aria-hidden /> {label}
                {id === "effects" && gearEntries.length > 0 && (
                  <span className="font-mono text-[0.84rem] text-flame">{gearEntries.length}</span>
                )}
              </button>
            ))}
          </div>

          {section === "stats" ? (
            <div>
              <section className="border-b border-line px-4 py-4 last:border-b-0">
                <div className="grid grid-cols-3 gap-2">
                  {STAT_ORDER.map((stat, i) => (
                    <StatBadge
                      key={stat}
                      stat={stat}
                      value={player.stats[stat]}
                      align={tipAlignForColumn(i)}
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MetricBadge metric="damage" align={tipAlignForColumn(0)} value={`${damage[0]}–${damage[1]}`} note={battle ? "До брони противника" : `Включая +${flatDamage} от силы и пассивных умений`} />
                  <MetricBadge metric="armor" align={tipAlignForColumn(2)} value={String(armor)} note={`Снаряжение: +${d.armorBonus}`} />
                  <MetricBadge metric="ap" align={tipAlignForColumn(5)} value={String(ap)} note="Ходы героя за раунд: 1 + ловкость + ускорение предметов" />
                </div>
              </section>

              <FoldSection title="Боевые параметры">
                <div className="grid grid-cols-3 gap-2">
                  <MetricBadge metric="techMultiplier" align={tipAlignForColumn(1)}
                    value={techWs ? (techWs.scaleMult + techSkillScale).toFixed(2) : "—"}
                    note={techWs ? `${STAT_META[techWs.scaleStat].name}, до 10 · ${techWs.scaleMult} + навыки ${techSkillScale.toFixed(2)}` : "Нет оружия с приёмом"}
                  />
                  <MetricBadge metric="evade" align={tipAlignForColumn(3)} value={percent(readout?.evade ?? d.evade)} note="Предел — 99%" />
                  <MetricBadge metric="crit" align={tipAlignForColumn(4)} value={percent(readout?.crit ?? d.critChance)} note={`Множитель ×${(readout?.critDamage ?? d.critDamage).toFixed(2)}`} />
                  <MetricBadge metric="stamina" align={tipAlignForColumn(6)} value={String(stamina)} note="90 + ловкость ×10 + сила ×5" />
                  <MetricBadge metric="resist" align={tipAlignForColumn(7)} value={percent(resist)} note="Сопротивление эффектам, предел 99%" />
                  <MetricBadge metric="magicResist" align={tipAlignForColumn(8)} value={percent(readout?.magicResist ?? d.magicResist)} note="Снижение магического урона" />
                  <MetricBadge metric="fortify" align={tipAlignForColumn(9)} value={percent(readout?.fortify ?? d.fortify)} note="Снижение физического урона" />
                  {readout && <>
                    <MetricBadge metric="enemyDamage" align={tipAlignForColumn(10)} value={`${readout.effMin}–${readout.effMax}`} note="После его брони и защиты" />
                    <MetricBadge metric="incomingDamage" align={tipAlignForColumn(11)} value={`${readout.inMin}–${readout.inMax}`} note="После вашей брони и эффектов" />
                  </>}
                </div>
              </FoldSection>
            </div>
          ) : (
            <div>
              <SheetSection title="Эффекты">
                <EffectList entries={gearEntries} empty="У исследованных надетых вещей пока нет дополнительных свойств." />
                {unknownCount > 0 && <p className="mt-3 border border-dashed border-flamedim/50 p-2.5 text-[0.92rem] leading-relaxed text-mute">Не исследовано вещей: {unknownCount}. Откройте «Арсенал» → «Подробнее», чтобы изучить их свойства.</p>}
              </SheetSection>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
