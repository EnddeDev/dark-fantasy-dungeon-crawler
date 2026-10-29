import {
  EPIC_SKILLS,
  ITEMS,
  LEGENDARY_PASSIVES,
  MAX_LEVEL,

  PASSIVES,
  RARE_AFFIXES,
  RARITY_META,
  STAT_META,
  STAT_ORDER,
  WEAR_META,
  scaledGearStats,
  xpForNextLevel,
} from "../game/content";
import { derived, getEquippedGear, type BattleState } from "../game/battle";
import { SLOT_META, SLOT_ORDER } from "../game/types";
import type { Player, Run, StatKey } from "../game/types";
import { ItemArt } from "./ItemArt";
import { Btn, Meter, Panel, Pips, Tag } from "./ui";

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
  const d = derived(player);
  const eq = getEquippedGear(player);
  const hp = battle ? battle.p.hp : player.hp;
  const maxHp = battle ? battle.p.maxHp : d.maxHp;
  const bag = battle ? battle.bag : player.bag;
  const wound = battle ? battle.p.statuses.wound : player.statuses.wound;
  const curse = battle ? battle.p.statuses.curse : player.statuses.curse;
  const poison = battle ? battle.p.statuses.poison : player.statuses.poison;
  const inRun = !!run && !battle;

  const xpNeed = xpForNextLevel(player.level);
  

  const derivedLine = (k: StatKey) => {
    if (k === "str") return `урон +${Math.floor(player.stats.str * 0.8)} · стойк. ${player.stats.str * 6}%`;
    if (k === "agi") return `ходов: ${d.ap}${player.passives.includes("first_blood") ? " (+1 в 1-м)" : ""}`;
    return `свитки и приёмы до ИНТ ${player.stats.int + d.intDiscount}`;
  };

  return (
    <aside className="order-2 shrink-0 border-line bg-slab lg:sticky lg:top-0 lg:order-1 lg:h-screen lg:w-[348px] lg:overflow-y-auto lg:border-r">
      <div className="grain border-b border-line px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="sc">Лист персонажа · Ур. {player.level}/{MAX_LEVEL}</span>
          <span className="font-mono text-[0.7rem] text-flamedim">убито: {player.kills}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-title text-3xl leading-tight text-flamehi">Покоритель</h1>
          {player.statPoints > 0 && (
            <Tag tone="flame">+{player.statPoints} очк. хар.</Tag>
          )}
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
          <span className="sc text-rubric">Здоровье</span>
          <span className="font-mono text-sm tab text-parch">
            {hp}<span className="text-mute">/{maxHp}</span>
          </span>
          <Meter value={hp} max={maxHp} tone="rubric" className="col-span-2" />

          <span className="sc text-flamedim">Опыт</span>
          <span className="font-mono text-xs tab text-parch">
            {player.level >= MAX_LEVEL ? (
              <span className="text-flame">МАКС</span>
            ) : false ? (
              <span className="text-flamedim">предел этажа</span>
            ) : (
              <>
                {player.xp}<span className="text-mute">/{xpNeed}</span>
              </>
            )}
          </span>
          <Meter
            value={player.level >= MAX_LEVEL ? 1 : player.xp}
            max={player.level >= MAX_LEVEL ? 1 : xpNeed}
            tone="flame"
            className="col-span-2"
            ticks={8}
          />
        </div>

        {(wound > 0 || curse > 0 || poison > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {wound > 0 && <Tag tone="rubric">кровотечение · {wound}</Tag>}
            {curse > 0 && <Tag tone="rubric">проклятие · {curse}</Tag>}
            {poison > 0 && <Tag tone="rubric">отравление · {poison}</Tag>}
          </div>
        )}
      </div>

      <div className="border-b border-line px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="sc">Характеристики</span>
          <span className="font-mono text-[0.68rem] text-mute">
            {player.statPoints > 0 ? `свободно: ${player.statPoints}` : "макс. 10"}
          </span>
        </div>
        <div className="space-y-4">
          {STAT_ORDER.map((k) => {
            const v = player.stats[k];
            return (
              <div key={k}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[0.95rem] uppercase tracking-[0.12em] text-parch">
                    {STAT_META[k].name}
                  </span>
                  <span className="font-mono text-sm tab text-flame">{String(v).padStart(2, "0")}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <Pips value={v} tone={v >= 5 ? "#e0a33c" : "#ad7a2c"} />
                  <span className="font-mono text-[0.62rem] text-mute">{derivedLine(k)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-b border-line px-4 py-4">
        <span className="sc">Пассивные способности</span>
        <div className="mt-2 space-y-2">
          {player.passives.length === 0 && (
            <p className="text-sm italic leading-snug text-mute">
              Пусто. Открываются на 5-м и 10-м значении любой характеристики — выбирается 1 из 2.
            </p>
          )}
          {player.passives.map((id) => {
            for (const k of STAT_ORDER)
              for (const t of ["5", "10"] as const)
                for (const p of PASSIVES[k][t])
                  if (p.id === id)
                    return (
                      <div key={id} className="border-l-2 border-flamedim pl-2.5">
                        <div className="font-display text-[0.85rem] uppercase tracking-[0.1em] text-flamehi">
                          {p.name}
                        </div>
                        <div className="text-[0.8rem] leading-snug text-mute">{p.desc}</div>
                      </div>
                    );
            return null;
          })}
        </div>
      </div>

      <div className="border-b border-line px-4 py-4">
        <span className="sc">Снаряжение</span>
        <div className="mt-2 space-y-2.5">
          {SLOT_ORDER.map((s) => {
            const g = eq[s];
            const label = SLOT_META[s].name;
            if (!g) {
              return (
                <div key={s} className="flex items-baseline justify-between gap-2 border-b border-line/60 pb-1.5">
                  <span className="sc text-flamedim">{label}</span>
                  <span className="text-right text-[0.8rem] text-mute italic">пусто</span>
                </div>
              );
            }
            const st = scaledGearStats(g);
            const rMeta = RARITY_META[g.rarity];
            const wMeta = WEAR_META[g.wear];
            const ws = st.skill;
            const wsUnlocked = ws && player.stats.int >= Math.max(1, ws.intReq - d.intDiscount);

            return (
              <div key={s} className="border-b border-line/60 pb-2">
                <div className="flex items-start gap-2">
                  <ItemArt
                    id={g.baseId}
                    name={st.base.name}
                    size={40}
                    rarity={g.identified ? g.rarity : undefined}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="sc text-[0.58rem] text-flamedim">{label}</span>
                      <span className="text-right font-display text-[0.86rem] uppercase tracking-[0.06em] text-flamehi">
                        {st.base.name}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap justify-end gap-1">
                      <Tag tone="mute">ур. {g.level ?? 1}</Tag>
                      <Tag tone="mute">
                        {wMeta.name} ×{wMeta.mult}
                      </Tag>
                      {g.identified ? (
                        <Tag tone={rMeta.tone}>{rMeta.name}</Tag>
                      ) : (
                        <Tag tone="flame">Редкость: ???</Tag>
                      )}
                      {st.dmg && <Tag tone="mute">урон {st.dmg[0]}–{st.dmg[1]}</Tag>}
                      {st.armor > 0 && <Tag tone="verd">броня +{st.armor}</Tag>}
                      {st.hp > 0 && <Tag tone="mute">ОЗ +{st.hp}</Tag>}
                    </div>
                  </div>
                </div>
                {ws && (
                  <div className="mt-1 text-right font-mono text-[0.63rem] text-mute">
                    приём:{" "}
                    <span className={wsUnlocked ? "text-flame" : "text-rubric"}>
                      {ws.name} (ИНТ {Math.max(1, ws.intReq - d.intDiscount)})
                    </span>
                  </div>
                )}
                {g.identified && g.rareAffix && (
                  <div className="mt-0.5 text-right font-mono text-[0.63rem] text-verd">• {RARE_AFFIXES[g.rareAffix].name}</div>
                )}
                {g.identified && g.epicSkill && (
                  <div className="mt-0.5 text-right font-mono text-[0.63rem] text-flame">
                    • {EPIC_SKILLS[g.epicSkill].name} (ИНТ {Math.max(1, EPIC_SKILLS[g.epicSkill].intReq - d.intDiscount)})
                  </div>
                )}
                {g.identified && g.legendaryPassive && (
                  <div className="mt-0.5 text-right font-mono text-[0.63rem] text-rubric">
                    ★ {LEGENDARY_PASSIVES[g.legendaryPassive].name}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex items-baseline justify-between gap-2 pt-0.5">
            <span className="sc text-flamedim">Сводка боя</span>
            <span className="font-mono text-[0.78rem] tab text-verd">
              уд. {d.hit[0]}–{d.hit[1]} · бр. {d.armor} · укл. {Math.round(d.evade * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <span className="sc">Рюкзак · припасы и оружие</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.keys(bag).length === 0 && (
            <span className="text-sm italic text-mute">Пусто — запасись зельями и свитками перед спуском.</span>
          )}
          {Object.entries(bag)
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => {
              const def = ITEMS[id];
              if (!def) return null;
              const tone =
                def.kind === "reagent" ? "verd" : def.kind === "scroll" ? "flame" : "mute";
              return (
                <Tag key={id} tone={tone} title={def.desc}>
                  {def.name} ×{n}
                </Tag>
              );
            })}
        </div>
      </div>

      {run && (
        <div className="border-t border-line bg-black/40 px-4 py-4">
          <div className="flex items-baseline justify-between">
            <span className="sc text-rubric">Добыча под риском</span>
            <span className="font-mono text-lg tab text-flame">{run.gold} зол.</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="border border-line py-1.5">
              <div className="font-mono text-sm tab text-parch">{run.floor}</div>
              <div className="sc text-[0.55rem]">этаж</div>
            </div>
            <div className="border border-line py-1.5">
              <div className="font-mono text-sm tab text-parch">{run.keys}</div>
              <div className="sc text-[0.55rem]">ключи</div>
            </div>
            <div className="border border-line py-1.5">
              <div className="font-mono text-sm tab text-parch">{run.loot.length + run.gearLoot.length}</div>
              <div className="sc text-[0.55rem]">трофеи</div>
            </div>
          </div>
          <p className="mt-2 text-[0.78rem] leading-snug text-mute">
            Поражение в бою отнимает всё найденное. Выход из подземелья сохраняет золото, предметы и трофейное снаряжение.
          </p>
          {inRun && onLeaveRun && (
            <Btn tone="danger" className="mt-3 w-full" onClick={onLeaveRun}>
              Покинуть подземелье
            </Btn>
          )}
        </div>
      )}

      <div className="border-t border-line px-4 py-3">
        <span className="sc">Кошель</span>
        <div className="font-mono text-xl tab text-flamehi">
          {player.gold} <span className="text-xs text-mute">золота</span>
        </div>
      </div>
    </aside>
  );
}

export function BagChip({ id, n }: { id: string; n: number }) {
  const def = ITEMS[id];
  if (!def) return null;
  return (
    <Panel className="px-2 py-1">
      <span className="font-mono text-xs">
        {def.name} ×{n}
      </span>
    </Panel>
  );
}
