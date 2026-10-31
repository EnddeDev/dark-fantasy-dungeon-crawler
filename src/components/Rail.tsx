import { useState, type ReactNode } from "react";
import { Activity, Coins, LogOut, Sparkles } from "lucide-react";
import {
  ARCHETYPES,
  GEAR_BASES,
  LEGENDARY_PASSIVES,
  MAX_LEVEL,
  PASSIVES,
  RARE_AFFIXES,
  legendaryPassiveDesc,
  rareAffixDesc,
  STAT_META,
  STAT_ORDER,
  xpForNextLevel,
} from "../game/content";
import { GEAR_EFFECTS, GEAR_PASSIVES, effectDetail, passiveDetail } from "../game/gearEffects";
import { archetypeByMilestone } from "../game/archetypes";
import { statMilestoneById } from "../game/statMilestones";
import { combatReadout, derived, equippedList, type BattleState } from "../game/battle";
import type { Player, Run } from "../game/types";
import { Btn, Meter, Pips } from "./ui";
import { isBattleCurse, trapBypassChance, trapDisarmChance } from "../game/traps";

type EffectEntry = {
  id: string;
  title: string;
  detail: string;
  source?: string;
  badge?: string;
  negative?: boolean;
};

function EffectList({ entries, empty }: { entries: EffectEntry[]; empty: string }) {
  if (!entries.length) return <p className="text-[0.98rem] leading-relaxed text-mute">{empty}</p>;

  return (
    <div className="space-y-2.5">
      {entries.map((entry) => (
        <div key={entry.id} className={`border-l-2 bg-black/20 py-2 pl-3 pr-2 ${entry.negative ? "border-rubric/70" : "border-flamedim/70"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h4 className={`font-display text-[1.05rem] uppercase leading-snug tracking-[0.05em] ${entry.negative ? "text-rubric" : "text-flamehi"}`}>
              {entry.title}
            </h4>
            {entry.badge && <span className="font-mono text-[0.86rem] text-mute">{entry.badge}</span>}
          </div>
          <p className="mt-1 text-[0.97rem] leading-relaxed text-parch/85">{entry.detail}</p>
          {entry.source && <p className="mt-1 text-[0.89rem] leading-snug text-mute">Источник: {entry.source}</p>}
        </div>
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

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border border-line/80 bg-black/20 px-3 py-2.5">
      <div className="text-[0.92rem] text-mute">{label}</div>
      <div className="mt-1 font-mono text-[1.13rem] leading-tight tab text-flamehi">{value}</div>
      {note && <div className="mt-1 text-[0.87rem] leading-snug text-mute">{note}</div>}
    </div>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Панель персонажа: характеристики и эффекты; смена вещей находится в арсенале. */
export function Rail({
  player,
  run,
  battle,
  onLeaveRun,
}: {
  player: Player;
  run: Run | null;
  battle: BattleState | null;
  onLeaveRun?: () => void;
}) {
  const [section, setSection] = useState<"stats" | "effects">("stats");
  const [mobileOpen, setMobileOpen] = useState(false);
  const d = derived(player);
  const arch = player.archetype ? ARCHETYPES[player.archetype] : null;
  const readout = battle ? combatReadout(battle) : null;
  const flatDamage = d.strFlat + (player.passives.includes("heavy_hand") ? 3 : 0) + d.rareAffixes.filter((id) => id === "might").length * 3;
  const damage: [number, number] = readout ? [readout.dmgMin, readout.dmgMax] : [d.hit[0] + flatDamage, d.hit[1] + flatDamage];
  const armor = readout?.armor ?? d.armor;
  const ap = readout?.ap ?? d.ap;
  const resist = readout?.resist ?? Math.min(0.75, player.stats.str * 0.06 + (player.passives.includes("stone_skin") ? 0.15 : 0));
  const trapBypass = trapBypassChance(player.stats, (player.passives.includes("light_step") ? 0.3 : 0) + d.rareAffixes.filter((id) => id === "swift").length * 0.12);
  const trapDisarm = trapDisarmChance(player.stats, (player.passives.includes("light_step") ? 0.3 : 0) + d.rareAffixes.filter((id) => id === "swift").length * 0.12);
  const xpNeed = xpForNextLevel(player.level);
  const statuses = battle ? battle.p.statuses : player.statuses;
  const worn = equippedList(player).filter((item) => item.identified);

  const learned: EffectEntry[] = player.passives.flatMap((id) => {
    const sm = statMilestoneById(id);
    if (sm) {
      const arch = ARCHETYPES[sm.archetype];
      return [{
        id: `learned-${id}`,
        title: sm.name,
        detail: sm.desc,
        source: `${STAT_META[sm.stat].name} ${sm.tier} · ${arch.name}`,
        badge: id === "arch_bulwark_10" && battle?.p.immortalUsed ? "Использовано" : undefined,
      }];
    }
    const arch = archetypeByMilestone(id);
    if (arch) {
      const m = arch.milestone5.id === id ? arch.milestone5 : arch.milestone10;
      return [{
        id: `learned-${id}`,
        title: m.name,
        detail: m.desc,
        source: `${arch.name} · ${STAT_META[arch.stat].name}`,
        badge: id === "arch_bulwark_10" && battle?.p.immortalUsed ? "Использовано" : undefined,
      }];
    }
    for (const stat of STAT_ORDER) {
      for (const tier of ["5", "10"] as const) {
        const passive = PASSIVES[stat][tier].find((entry) => entry.id === id);
        if (passive) return [{
          id: `learned-${id}`,
          title: passive.name,
          detail: passive.desc,
          source: `${STAT_META[stat].name}, рубеж ${tier}`,
          badge: id === "immortal_pact" && battle?.p.immortalUsed ? "Использовано" : undefined,
        }];
      }
    }
    return [];
  });

  /* Свойства группируем по типу, но сохраняем все источники и число повторений. */
  const gearEffects = new Map<string, EffectEntry & { sources: Set<string>; count: number }>();
  const addGearEffect = (id: string, title: string, detail: string, source: string) => {
    const existing = gearEffects.get(id);
    if (existing) {
      existing.count += 1;
      existing.sources.add(source);
      return;
    }
    gearEffects.set(id, { id, title, detail, sources: new Set([source]), count: 1 });
  };
  worn.forEach((item) => {
    const source = item.baseId;
    item.effects.forEach((id) => {
      const effect = GEAR_EFFECTS[id];
      if (effect) addGearEffect(`effect-${id}`, effect.name, effectDetail(id, item.level ?? 1), source);
    });
    if (item.passive) {
      const passive = GEAR_PASSIVES[item.passive];
      if (passive) addGearEffect(`passive-${item.passive}`, passive.name, passiveDetail(item.passive, item.level ?? 1), source);
    }
    if (item.rareAffix) {
      const affix = RARE_AFFIXES[item.rareAffix];
      addGearEffect(`affix-${item.rareAffix}`, affix.name, rareAffixDesc(item.rareAffix, item.level ?? 1), source);
    }
    if (item.legendaryPassive) {
      const passive = LEGENDARY_PASSIVES[item.legendaryPassive];
      addGearEffect(`legendary-${item.legendaryPassive}`, passive.name, legendaryPassiveDesc(item.legendaryPassive, item.level ?? 1), source);
    }
  });
  const gearEntries: EffectEntry[] = [...gearEffects.values()].map((entry) => ({
    ...entry,
    source: [...entry.sources].map((id) => GEAR_BASES[id]?.name ?? id).join(", "),
    badge: entry.count > 1 ? `Предметов: ${entry.count}` : undefined,
  }));

  const current: EffectEntry[] = readout
    ? [...readout.dmgMods, ...readout.defMods].map((mod) => ({
        id: `current-${mod.id}`,
        title: mod.label,
        detail: mod.detail,
        badge: mod.rounds ? `Осталось: ${mod.rounds}` : "В этом бою",
        negative: !mod.good,
      }))
    : [
        ...(statuses.wound > 0 && !d.legendaryPassives.includes("titan_heart") ? [{ id: "wound", title: "Кровотечение", detail: `На каждом шаге отнимает ${2 + (run?.floor ?? 1)} здоровья.`, badge: `Осталось: ${statuses.wound}`, negative: true }] : []),
        ...(statuses.poison > 0 && !d.legendaryPassives.includes("titan_heart") ? [{ id: "poison", title: "Отравление", detail: `На каждом шаге отнимает ${3 + (run?.floor ?? 1)} здоровья.`, badge: `Осталось: ${statuses.poison}`, negative: true }] : []),
        ...(statuses.curse > 0 ? [{ id: "curse", title: "Проклятие", detail: `В бою наносимый урон снижен на ${statuses.cursePower ?? 30}%.`, badge: isBattleCurse(statuses.curse) ? "До конца боя" : `Осталось: ${statuses.curse}`, negative: true }] : []),
      ];
  if (battle && battle.p.statuses.haste > 0) current.push({
    id: "haste", title: "Ускорение", detail: "+1 ход в каждом раунде, пока действует зелье.", badge: `Раундов: ${battle.p.statuses.haste}`,
  });
  if (d.legendaryPassives.includes("titan_heart") && (statuses.wound > 0 || statuses.poison > 0)) {
    current.push({ id: "titan-immunity", title: "Сердце колосса", detail: "Иммунитет к периодическому урону от кровотечения и яда." });
  }

  const activeCount = current.length;
  const unknownCount = equippedList(player).filter((item) => !item.identified).length;
  const activeEffects = activeCount + learned.length + gearEntries.length;

  return (
    <aside className="order-1 min-w-0 shrink-0 border-b border-line bg-slab lg:sticky lg:top-0 lg:h-dvh lg:w-[350px] lg:border-b-0 lg:border-r xl:w-[380px]" aria-label="Персонаж">
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
            <div className="flex items-baseline justify-end gap-2">
              <span className="font-mono text-[0.88rem] text-mute">Побед: {player.kills}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-title text-[1.85rem] leading-tight text-flamehi">{player.name}</h2>
              <span className="font-mono text-sm text-flame">Ур. {player.level}/{MAX_LEVEL}</span>
            </div>
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
                {id === "effects" && (activeCount > 0 || activeEffects > 0) && (
                  <span className="font-mono text-[0.84rem] text-flame">{activeCount > 0 ? activeCount : activeEffects}</span>
                )}
              </button>
            ))}
          </div>

          {section === "stats" ? (
            <div>
              <SheetSection title="Основные характеристики">
                <div className="space-y-3">
                  {STAT_ORDER.map((stat) => (
                    <div key={stat} className="border border-line/70 bg-black/15 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-display text-[1.08rem] uppercase tracking-[0.08em] text-parch">{STAT_META[stat].name}</span>
                        <span className="font-mono text-base tab text-flame">{player.stats[stat]}<span className="text-xs text-mute"> / 10</span></span>
                      </div>
                      <div className="mt-2"><Pips value={player.stats[stat]} tone={player.stats[stat] >= 5 ? "#e0a33c" : "#ad7a2c"} /></div>
                      <p className="mt-2 text-[0.92rem] leading-snug text-mute">{STAT_META[stat].gain}</p>
                    </div>
                  ))}
                </div>
              </SheetSection>

              <SheetSection title={battle ? "Бой · текущие значения" : "Боевые параметры"}>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Архетип" value={arch ? arch.name : "не выбран"} note={arch ? `${arch.short} · рубежи 5/10` : "Откроется на 5 уровне"} />
            <Metric label="Урон оружия" value={`${damage[0]}–${damage[1]}`} note={battle ? "До брони противника" : `Включая +${flatDamage} от силы и пассивных умений`} />
                  <Metric label="Броня" value={String(armor)} note={`Снаряжение: +${d.armorBonus}`} />
                  <Metric label="Уклонение" value={percent(d.evade)} note="Предел — 65%" />
                  <Metric label="Критический удар" value={percent(d.critChance)} note="Базовый множитель ×2" />
                  <Metric label="Ходы за раунд" value={String(ap)} note={player.passives.includes("first_blood") ? "+1 в первом раунде" : undefined} />
                  <Metric label="Стойкость" value={percent(resist)} note="Сопротивление эффектам" />
                  {readout && <>
                    <Metric label="Урон по врагу" value={`${readout.effMin}–${readout.effMax}`} note="После его брони и защиты" />
                    <Metric label="Входящий урон" value={`${readout.inMin}–${readout.inMax}`} note="После вашей брони и эффектов" />
                  </>}
                </div>
              </SheetSection>

              <SheetSection title="Исследования и ловушки">
                <dl className="space-y-2 text-[0.97rem]">
                  <div className="flex justify-between gap-3"><dt className="text-mute">Обход ловушки</dt><dd className="font-mono tab text-verd">{Math.round(trapBypass * 100)}%</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-mute">Обезвреживание</dt><dd className="font-mono tab text-verd">{Math.round(trapDisarm * 100)}%</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-mute">Снижение требований ИНТ</dt><dd className="font-mono tab text-parch">−{d.intDiscount}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-mute">Изучено рецептов</dt><dd className="font-mono tab text-parch">{player.knownRecipes.length}</dd></div>
                </dl>
                <p className="mt-2 text-[0.9rem] leading-snug text-mute">Снижение ИНТ действует на приёмы и исследование, но не на требования к надеванию вещей.</p>
              </SheetSection>
            </div>
          ) : (
            <div>
              <SheetSection title={battle ? "Сейчас в бою" : "Текущее состояние"}>
                <EffectList entries={current} empty={statuses.wound || statuses.poison || statuses.curse ? "Периодический урон заблокирован иммунитетом." : "Нет временных эффектов. Раны, проклятия и яд появятся здесь."} />
              </SheetSection>
              <SheetSection title="Выученные способности">
                <EffectList entries={learned} empty="Пока нет выученных способностей. Они открываются на 5-м и 10-м значении характеристики во вкладке «Развитие»." />
              </SheetSection>
              <SheetSection title="Свойства надетых вещей">
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
