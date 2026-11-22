import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EffectsTab, InfoTag, SummaryTabs, chipEntries, roman, type SummaryTab } from "../../components/BattleView";
import { EffectChips } from "../../components/EffectChips";
import { PlayerPortrait } from "../../components/PlayerPortrait";
import { biomeStyle } from "../../components/BiomeLabel";
import { Btn, Meter, Tag } from "../../components/ui";
import { ActionTipBody, HoverTip, concText, floatColor, floatText, type FloatNumber } from "../../components/DamageTip";
import { ARCHETYPES } from "../../game/archetypes";
import { ATTACK_KIND_META, ATTACK_KINDS, MAX_CONCENTRATION, SPECIAL_CONCENTRATION, type AttackKind } from "../../game/battle";
import {
  DUEL_DRAIN_SHARE,
  DUEL_GUARD_ARMOR,
  DUEL_POTION_HEAL,
  duelActionError,
  duelAttackBreakdown,
  duelAttackCost,
  duelConcentrationDelta,
  duelHitChance,
  duelTechniqueBreakdown,
  duelTechniqueCost,
  type DuelAction,
  type DuelFighter,
  type DuelHit,
  type DuelSide,
  type DuelState,
} from "../../game/duel";
import { DAMAGE_NUMBER_COLORS } from "../../game/damageNumbers";
import { EFFECT_COLORS, type EffectChip, type EffectDot } from "../../game/effects";
import { ITEMS } from "../../game/content";
import { OIL_NAMES } from "../../game/statusEffects";
import { STAMINA_BACKPACK, STAMINA_GUARD } from "../../game/stamina";
import type { OnlineSession } from "../../net/online";
import type { DuelDetail, DuelSummary } from "../../net/protocol";
import { EmptyNote, ErrorBar, Panel, useSync } from "./shared";

const STATUS_LABEL: Record<DuelSummary["status"], string> = {
  pending: "вызов",
  active: "идёт бой",
  finished: "завершена",
  declined: "отклонена",
  cancelled: "снята",
};

function Countdown({ deadline }: { deadline: number }) {
  const [left, setLeft] = useState(Math.max(0, deadline - Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(Math.max(0, deadline - Date.now())), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  const seconds = Math.ceil(left / 1000);
  return (
    <span className={`font-mono text-[1.1rem] ${seconds <= 5 ? "text-rubric" : "text-flamehi"}`}>
      {seconds > 0 ? `${seconds} с` : "время вышло"}
    </span>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Число над карточкой: событие из состояния дуэли, ключ — номер хода и порядок в действии. */
type DuelFloat = FloatNumber & { key: string };

/** Эффекты бойца теми же чипами, что в бою: защита и щит — свои, остальное наложил соперник. */
function fighterChips(f: DuelFighter): EffectChip[] {
  const out: EffectChip[] = [];
  if (f.guard) {
    out.push({ id: "guard", name: "Защита", polarity: "good", rounds: null, unit: "до своего хода", details: [`Броня +${DUEL_GUARD_ARMOR} до начала своего хода.`], boosts: [], color: EFFECT_COLORS.buff });
  }
  if (f.invulnerable) {
    out.push({ id: "pact", name: "Неуязвимость", polarity: "good", rounds: null, unit: "до своего хода", details: ["Урон не проходит до начала своего хода."], boosts: [], color: EFFECT_COLORS.immunity });
  }
  if (f.bulwarkBonus > 0) {
    out.push({ id: "tempArmor", name: "Щит", polarity: "good", rounds: null, unit: "до удара", details: [`Следующий удар получит +${f.bulwarkBonus} урона.`], boosts: [], color: EFFECT_COLORS.buff });
  }
  if (f.coat && f.coat.rounds > 0) {
    out.push({ id: "oil", name: OIL_NAMES[f.coat.oil], polarity: "good", rounds: f.coat.rounds, unit: "раунд", details: ["Смазка клинка: каждое попадание накладывает эффект масла."], boosts: [], color: EFFECT_COLORS.buff });
  }
  for (const e of f.effects) {
    const base = { rounds: e.rounds, polarity: "bad" as const, boosts: [] };
    /* Тики v2: периодика срабатывает в начале хода носителя; срок — в тиках. */
    const tickOf = (perTick: number, type: EffectDot["type"]) => ({ perTick, ticks: e.rounds, total: perTick * e.rounds, type, when: "в начале хода" });
    if (e.kind === "burn") {
      const t = e.value + (e.bonus ?? 0);
      out.push({ ...base, id: "burn", name: "Горение", details: [`Урон ${t} за ход носителя.`], dot: tickOf(t, "огонь"), color: EFFECT_COLORS.burn });
    } else if (e.kind === "bleed") {
      out.push({ ...base, id: "bleed", name: "Кровотечение", details: [`Урон ${e.value} за ход носителя.`], dot: tickOf(e.value, "физический"), color: EFFECT_COLORS.bleed });
    } else if (e.kind === "poison") {
      out.push({ ...base, id: "poison", name: "Яд", details: [`Урон ${e.value} за ход носителя.`], dot: tickOf(e.value, "физический"), color: EFFECT_COLORS.poison });
    } else if (e.kind === "ice") {
      const t = e.value + (e.bonus ?? 0);
      const slow = e.pct ? [`Урон носителя −${Math.round(e.pct)}%.`] : [];
      out.push({ ...base, id: "frost", name: e.name, details: [`Урон ${t} за ход носителя.`, ...slow], dot: tickOf(t, "магический"), color: EFFECT_COLORS.frost });
    } else if (e.kind === "chill") {
      out.push({ ...base, id: "chill", name: "Обморожение", details: [`Урон снижен на ${e.value}%.`], color: EFFECT_COLORS.chill });
    } else if (e.kind === "drain") {
      const tick = Math.max(1, Math.ceil(f.maxHp * DUEL_DRAIN_SHARE));
      out.push({ ...base, id: "drain", name: "Иссушение", details: [`${pct(DUEL_DRAIN_SHARE)} макс. ОЗ за ход; иссушающий получает столько же здоровья.`], dot: tickOf(tick, "магический"), color: EFFECT_COLORS.curse });
    } else if (e.kind === "weak") {
      out.push({ ...base, id: "weaken", name: e.name, details: [`Броня −${e.value}%.`], color: EFFECT_COLORS.sunder });
    } else if (e.kind === "noheal") {
      out.push({ ...base, id: "noHeal", name: e.name, details: ["Лечение не действует."], color: EFFECT_COLORS.depleted });
    } else {
      out.push({ ...base, id: "sunder", name: "Раскол", details: [`Броня −${e.value}.`], color: EFFECT_COLORS.bleed });
    }
  }
  return out;
}

/** Строки характеристик в два столбца, как в сводке боя. */
function fighterRows(f: DuelFighter): { label: string; value: string }[] {
  return [
    { label: "Оружие", value: f.weaponName },
    { label: "Удары", value: `${f.hands.length}` },
    { label: "Урон", value: `${f.hit[0]}–${f.hit[1]} +${f.strFlat}` },
    { label: "Крит", value: `${pct(f.crit)} ×${f.critDamage.toFixed(1)}` },
    { label: "Броня", value: `${f.armor}${f.guard ? ` +${DUEL_GUARD_ARMOR}` : ""}` },
    { label: "Уклонение", value: pct(f.evade) },
    { label: "Ходов за ход", value: `${f.ap}` },
    { label: "Выносливость", value: `${f.stamina}/${f.staminaMax}` },
    { label: "Концентрация", value: `${f.concentration}/${MAX_CONCENTRATION}` },
    { label: "Приём", value: f.skill ? (f.cooldown > 0 ? `${f.skill.name}, ${f.cooldown} р.` : f.skill.name) : "нет" },
    { label: "Интеллект", value: `${f.intStat}` },
    { label: "Зелья", value: `${f.potions}` },
  ];
}

function StatRows({ f }: { f: DuelFighter }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[0.94rem]">
      {fighterRows(f).map((row) => (
        <div key={row.label} className="flex justify-between gap-2 border-b border-line/40 pb-1">
          <span className="text-mute">{row.label}</span>
          <span className="text-right font-mono text-parch">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Портрет и место для карточек арены. */
type PortraitRef = { id: string; version: number | null };

/** Имена двух игроков с портретами для списков: «Аня против Бори». */
function Versus({ d }: { d: DuelSummary }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <PlayerPortrait id={d.challengerId} name={d.challengerName} version={d.challengerPortrait} size={24} />
        {d.challengerName}
      </span>
      <span>против</span>
      <span className="inline-flex items-center gap-1.5">
        <PlayerPortrait id={d.opponentId} name={d.opponentName} version={d.opponentPortrait} size={24} />
        {d.opponentName}
      </span>
    </span>
  );
}

/** Карточка героя — как карточка героя в бою: здоровье, выносливость, концентрация, эффекты, сводка. */
function HeroCard({
  f,
  tab,
  onTab,
  floats,
  player,
}: {
  f: DuelFighter;
  tab: SummaryTab;
  onTab: (t: SummaryTab) => void;
  floats: DuelFloat[];
  player: PortraitRef;
}) {
  const chips = fighterChips(f);
  const hp = Math.max(0, f.hp);
  return (
    <div className="relative border border-line bg-slab/80 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <PlayerPortrait id={player.id} name={f.name} version={player.version} size={56} />
        <div className="min-w-0">
          <h3 className="font-display text-lg uppercase tracking-[0.14em] text-flamehi">{f.name}</h3>
          <span className="font-mono text-[0.84rem] text-mute">
            оружие: <b className="text-parch">{f.weaponName}</b> · ур. {f.level}
          </span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
        <span className="sc text-rubric">Здоровье</span>
        <Meter value={hp} max={f.maxHp} tone="rubric" />
        <span className="font-mono text-sm tab text-parch">{hp}/{f.maxHp}</span>
        <span className="sc text-flamedim">Выносливость</span>
        <Meter value={f.stamina} max={f.staminaMax} tone="flame" />
        <span className="font-mono text-sm tab text-parch">{f.stamina}/{f.staminaMax}</span>
      </div>
      {chips.length > 0 && (
        <div className="relative z-20 mt-2">
          <EffectChips chips={chips} label="эффекты героя" />
        </div>
      )}
      <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-3" title={`Концентрация ${f.concentration} из ${MAX_CONCENTRATION}`}>
        <span className="sc text-flamedim">Концентрация</span>
        <div className="flex gap-1" role="meter" aria-valuemin={0} aria-valuemax={MAX_CONCENTRATION} aria-valuenow={f.concentration} aria-label="Концентрация">
          {Array.from({ length: MAX_CONCENTRATION }, (_, i) => (
            <span key={i} className={`h-2 flex-1 ${i < f.concentration ? "bg-flame" : "bg-black/50"}`} />
          ))}
        </div>
        <span className="font-mono text-sm tab text-parch">{f.concentration}/{MAX_CONCENTRATION}</span>
      </div>
      <div className="mt-3 border-t border-line/70 pt-3">
        <span className="sc">Сводка боя</span>
        <div className="mt-2">
          <SummaryTabs value={tab} onChange={onTab} effectsCount={chips.length} />
        </div>
        {tab === "stats" ? <StatRows f={f} /> : <EffectsTab entries={chipEntries(chips)} label="эффекты героя" />}
      </div>
      {floats.map((fl) => (
        <span key={fl.key} className="hitflash pointer-events-none mt-1 block font-mono text-lg text-rubric" style={floatColor(fl)}>
          {floatText(fl)}
        </span>
      ))}
    </div>
  );
}

/** Карточка соперника — как карточка монстра в бою: блок имени внизу, теги, полоса ОЗ, сводка. */
function FoeCard({
  f,
  tab,
  onTab,
  floats,
  player,
}: {
  f: DuelFighter;
  tab: SummaryTab;
  onTab: (t: SummaryTab) => void;
  floats: DuelFloat[];
  player: PortraitRef;
}) {
  const chips = fighterChips(f);
  const hp = Math.max(0, f.hp);
  const archetype = f.archetype ? ARCHETYPES[f.archetype].name : null;
  return (
    <div className="relative flex flex-col bg-black/30">
      {chips.length > 0 && (
        <div className="absolute left-3 top-3 z-30 max-w-[76%]">
          <EffectChips chips={chips} size={34} label="эффекты соперника" />
        </div>
      )}
      <div className="relative aspect-[5/4] w-full border-b border-line bg-soot">
        <div className="absolute inset-0 overflow-hidden">
          {/* Портрет игрока; без портрета — крупный инициал на тёмном фоне. */}
          <PlayerPortrait id={player.id} name={f.name} version={player.version} fill />
          <div className="absolute inset-0 bg-gradient-to-t from-soot via-soot/10 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_40%,rgba(0,0,0,0.65)_100%)]" />
          {floats.length > 0 && (
            <div
              key={floats[floats.length - 1].key}
              className={`hitflash pointer-events-none absolute inset-0 flex items-center justify-center ${
                floats[floats.length - 1].kind === "heal" ? "bg-verd/25" : "bg-rubric/30"
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                {floats.map((fl) => (
                  <span
                    key={fl.key}
                    className={`font-mono text-parch drop-shadow-[0_2px_6px_#000] ${floats.length > 2 ? "text-2xl" : "text-4xl"}`}
                    style={floatColor(fl)}
                  >
                    {floatText(fl)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="absolute right-3 top-14 flex flex-wrap justify-end gap-1.5">
          <Tag tone="mute">ур. {f.level}</Tag>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          {archetype && <div className="sc mb-1 text-rubric">{archetype}</div>}
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <InfoTag
              tone="flame"
              label={f.weaponName}
              title="Оружие соперника"
              lines={f.hands.map((h) => `${h.name}: урон ${h.lo}–${h.hi}, выносливость ${h.cost}`)}
            />
            {f.skill && (
              <InfoTag
                tone="verd"
                label={`Приём «${f.skill.name}»`}
                title="Приём оружия"
                lines={[`Требует Интеллект ${f.skill.intReq}`, `Перезарядка ${f.skill.cooldown} р.`]}
              />
            )}
          </div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="font-display text-xl uppercase tracking-[0.12em] text-flamehi">{f.name}</h3>
            <span className="font-mono text-sm tab text-parch">{hp}/{f.maxHp}</span>
          </div>
          <Meter value={hp} max={f.maxHp} tone="rubric" />
        </div>
      </div>
      <div className="border-b border-line bg-slab/80 px-4 py-3">
        <span className="sc">Сводка соперника</span>
        <div className="mt-2">
          <SummaryTabs value={tab} onChange={onTab} effectsCount={chips.length} />
        </div>
        {tab === "stats" ? <StatRows f={f} /> : <EffectsTab entries={chipEntries(chips)} label="эффекты соперника" />}
      </div>
    </div>
  );
}

/** Арена дуэли в визуале боя. Сервер хранит состояние и следит за 20 секундами. */
function DuelRoom({
  online,
  duelId,
  onExit,
  onFinished,
}: {
  online: OnlineSession;
  duelId: string;
  onExit: () => void;
  onFinished: () => void;
}) {
  const [duel, setDuel] = useState<DuelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [heroTab, setHeroTab] = useState<SummaryTab>("stats");
  const [foeTab, setFoeTab] = useState<SummaryTab>("stats");
  /* События последнего действия (урон, лечение, промах) — как вспышки в бою; новое действие их заменяет. */
  const [hits, setHits] = useState<DuelHit[]>([]);
  const seenSeq = useRef<number | null>(null);

  const apply = (detail: DuelDetail) => {
    const s = detail.state;
    if (seenSeq.current !== null && seenSeq.current !== s.seq) setHits(s.hits ?? []);
    seenSeq.current = s.seq;
    setDuel(detail);
  };

  const load = async () => {
    try {
      const res = await online.api.duel(duelId);
      apply(res.duel);
      if (res.duel.status === "finished") onFinished();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось получить дуэль");
    }
  };
  // Таймер хода на сервере истекает без события, поэтому комнату опрашиваем часто и всегда.
  useSync(load, { live: online.live, scopes: ["duel"], ms: 1200, liveMs: 1200 });

  const act = async (action: DuelAction) => {
    if (action.type === "flee" && !window.confirm("Сдаться? Засчитается поражение.")) return;
    setBusy(true);
    try {
      const res = await online.api.duelAction(duelId, action);
      apply(res.duel);
      if (res.duel.status === "finished") onFinished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ход отклонён");
    } finally {
      setBusy(false);
    }
  };

  if (!duel) {
    return (
      <div className="border border-line bg-soot p-4">
        <ErrorBar error={error} />
        <p className="text-[0.94rem] italic text-mute">Загружаем арену…</p>
        <button onClick={onExit} className="mt-2 sc text-mute hover:text-flamehi">назад</button>
      </div>
    );
  }

  const state: DuelState = duel.state;
  const me = duel.yourSide;
  const my = state[me];
  const foe = state[me === "a" ? "b" : "a"];
  /** Игрок за стороной: id и версия портрета из сводки дуэли. */
  const sideOf = (side: "a" | "b"): PortraitRef => ({
    id: side === "a" ? duel.challengerId : duel.opponentId,
    version: side === "a" ? duel.challengerPortrait : duel.opponentPortrait,
  });
  const myTurn = state.turn === me && !state.winner;
  /* Числа над карточками: события текущего хода своей стороны и соперника. */
  const floatsOf = (side: DuelSide): DuelFloat[] =>
    hits
      .filter((h) => h.target === side)
      .map((h, i) => ({ key: `${state.seq}-${i}`, kind: h.kind === "dmg" ? "hit" : h.kind, amount: h.amount, dmg: h.type }));
  const special = my.archetype ? ARCHETYPES[my.archetype].special : null;
  /* Кнопки закрываются тем же правилом, что проверяет сервер: подсказка всегда про реальную причину. */
  const blockOf = (action: DuelAction) => (state.winner ? "Дуэль окончена" : duelActionError(state, me, action));
  const missOf = (kind: AttackKind) => Math.round((1 - duelHitChance(my, foe, kind)) * 100);
  const attackCost = duelAttackCost(my);
  /* Кнопка атаки с подсказкой, как в бою: урон по типам, шанс промаха и причина блока. */
  const attackBtn = (kind: AttackKind) => {
    const action: DuelAction = { type: "attack", kind };
    const block = blockOf(action);
    const breakdown = duelAttackBreakdown(my, foe, kind);
    const hands = my.hands.length > 1 ? `Ударов за атаку: ${my.hands.length} (по одному на каждую руку). Диапазон уже суммарный.` : undefined;
    return (
      <HoverTip
        tip={
          <ActionTipBody
            name={ATTACK_KIND_META[kind].name}
            desc={ATTACK_KIND_META[kind].desc}
            direct={breakdown.direct}
            procs={breakdown.procs}
            extra={hands}
            note="Без крита и с учётом защиты врага."
            lines={[
              `Выносливость: ${attackCost}`,
              concText(duelConcentrationDelta(action)),
              `Шанс промахнуться: ${missOf(kind)}%`,
            ]}
            block={block}
          />
        }
      >
        <Btn tone={block ? "ghost" : kind === "safe" ? "verd" : "flame"} disabled={!!block || busy} className="w-full" onClick={() => act(action)}>
          {ATTACK_KIND_META[kind].short}
        </Btn>
      </HoverTip>
    );
  };
  const techCost = duelTechniqueCost(my);
  const techBreak = duelTechniqueBreakdown(my, foe);
  const myName = my.name;
  const foeName = foe.name;

  /* Кнопка действия с всплывающим окном, как в бою: описание, расчёт, выносливость и причина блока. */
  const actionBtn = (action: DuelAction, label: string, tip: ReactNode, tone: "flame" | "verd" | "ghost" = "ghost", className = "") => {
    const block = blockOf(action);
    return (
      <HoverTip tip={tip}>
        <Btn tone={block ? "ghost" : tone} disabled={!!block || busy} onClick={() => act(action)} className={className}>
          {label}
        </Btn>
      </HoverTip>
    );
  };
  const simpleTip = (action: DuelAction, name: string, desc: string, lines: string[] = []) => (
    <ActionTipBody name={name} desc={desc} lines={lines} block={blockOf(action) ?? undefined} />
  );

  return (
    <div className="biome-surface flex flex-col border border-line bg-soot" data-biome="classic" style={biomeStyle("classic")}>
      {/* ПОЛОСА ДУЭЛИ — заголовок, раунд, статус хода и таймер, как полоса боя */}
      <div className="border-b-2 border-flamedim/50 bg-black/65 px-4 py-3 sm:px-6">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-xl uppercase tracking-[0.18em] text-flamehi sm:text-2xl">Дуэль</h2>
            <span className="font-mono text-lg tab text-flame">РАУНД {roman(state.round)}</span>
            <span className="inline-flex items-center border border-flamedim/70 bg-black/35 px-2.5 py-1 font-display text-[0.92rem] uppercase tracking-[0.08em] text-flamehi">
              {myName} против {foeName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`font-display text-sm uppercase tracking-[0.2em] ${
                state.winner ? "text-mute" : myTurn ? "text-flame" : "text-rubric"
              }`}
            >
              {state.winner ? "бой окончен" : myTurn ? "▶ твой ход" : "● ход соперника"}
            </span>
            {!state.winner && <Countdown deadline={state.deadline} />}
            <button onClick={onExit} className="sc text-mute hover:text-flamehi">
              назад
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <span className="flex flex-col justify-center border-2 border-flamedim/70 bg-flame/10 px-3 py-1.5 text-flame">
            <span className="font-mono text-3xl leading-none tab sm:text-4xl">{Math.max(0, state.apLeft)}</span>
            <span className="mt-1 font-display text-[0.72rem] uppercase tracking-[0.18em]">ходов</span>
          </span>
          <span className="ml-auto flex flex-col justify-center border border-line bg-black/40 px-3 py-1.5 text-right font-mono text-[0.84rem] leading-tight text-mute">
            <span>
              выносливость: <b className="text-flame">{my.stamina}/{my.staminaMax}</b>
            </span>
            <span>
              у соперника: <b className="text-rubric">{foe.stamina}/{foe.staminaMax}</b>
            </span>
          </span>
        </div>
      </div>

      <ErrorBar error={error} onClose={() => setError(null)} />

      <div className="grid flex-1 items-start xl:grid-cols-3">
        {/* ГЕРОЙ — левая колонка, как в бою */}
        <div className="order-2 min-w-0 border-b border-line p-4 sm:p-6 xl:order-1 xl:col-start-1 xl:border-b-0">
          <HeroCard f={my} tab={heroTab} onTab={setHeroTab} floats={floatsOf(me)} player={sideOf(me)} />
        </div>

        {/* ДЕЙСТВИЯ — центральная колонка */}
        <div className="order-3 min-w-0 border-b border-line p-4 sm:p-6 xl:order-2 xl:col-start-2 xl:border-b-0">
          <div className="border border-line bg-slab/95 p-4">
            <h3 className="sc mb-3 text-flamedim">Действия</h3>
            {!state.winner && !myTurn && (
              <div className="mb-3 h-2 w-full overflow-hidden bg-black/50">
                <div className="h-full w-1/3 animate-pulse bg-rubric/60" />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {ATTACK_KINDS.map((kind) => (
                <div key={kind}>{attackBtn(kind)}</div>
              ))}
            </div>

            <div className={`mt-2 grid gap-2 ${special ? "grid-cols-2" : "grid-cols-1"}`}>
              {actionBtn(
                { type: "technique" },
                my.skill ? `Приём · ${techCost}` : "Приём",
                my.skill ? (
                  <ActionTipBody
                    name={`Приём «${my.skill.name}»`}
                    desc="Удар оружием с бонусом приёма. Перезаряжается после использования."
                    direct={techBreak.direct}
                    procs={techBreak.procs}
                    note="Без крита и с учётом защиты врага."
                    lines={[
                      `Выносливость: ${techCost}`,
                      concText(-1),
                      `Перезарядка: ${my.cooldown > 0 ? my.cooldown : my.skill.cooldown} р.`,
                      `Шанс промахнуться: ${Math.round((1 - duelHitChance(my, foe, "normal")) * 100)}%`,
                    ]}
                    block={blockOf({ type: "technique" }) ?? undefined}
                  />
                ) : (
                  simpleTip({ type: "technique" }, "Приём", "У оружия нет приёма")
                ),
                "flame",
                "w-full",
              )}
              {special &&
                actionBtn(
                  { type: "archetype_skill" },
                  `Спец-приём: ${special.name} · ${my.concentration}/${MAX_CONCENTRATION}`,
                  simpleTip({ type: "archetype_skill" }, special.name, special.desc, [`Концентрация: ${SPECIAL_CONCENTRATION}`, concText(-SPECIAL_CONCENTRATION), "Выносливость не тратится."]),
                  "flame",
                  "w-full",
                )}
            </div>
            {special && <p className="mb-2 mt-1 text-[0.85rem] leading-snug text-mute">{special.desc}</p>}

            <div className="mt-2 grid grid-cols-3 gap-2">
              {actionBtn({ type: "potion" }, `Зелье · ${my.potions}`, simpleTip({ type: "potion" }, "Зелье", `Лечит ${DUEL_POTION_HEAL} ОЗ.`, [`Выносливость: ${STAMINA_BACKPACK}`, concText(1)]), "ghost", "w-full")}
              {actionBtn({ type: "guard" }, `Защита · ${STAMINA_GUARD}`, simpleTip({ type: "guard" }, "Защита", `Броня +${DUEL_GUARD_ARMOR} до своего хода. Ход не заканчивается.`, [`Выносливость: ${STAMINA_GUARD}`, concText(2)]), "verd", "w-full")}
              {actionBtn({ type: "pass" }, "Пропуск хода", simpleTip({ type: "pass" }, "Пропуск хода", "Заканчивает ход без действия."), "ghost", "w-full")}
            </div>
            {my.oils.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {my.oils.map((o) => (
                  <div key={o.id}>
                    {actionBtn(
                      { type: "oil", id: o.id },
                      `Масло · ${o.name}${o.count > 1 ? ` ×${o.count}` : ""}`,
                      simpleTip({ type: "oil", id: o.id }, o.name, ITEMS[o.id]?.desc ?? "", [
                        `Выносливость: ${STAMINA_BACKPACK}`,
                        concText(1),
                        `Смазка на ${o.coat} раунда: каждое попадание накладывает ${OIL_NAMES[o.oil].toLowerCase()}.`,
                      ]),
                      "flame",
                      "w-full",
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2">
              {actionBtn({ type: "flee" }, "Сдаться", simpleTip({ type: "flee" }, "Сдаться", "Засчитывается поражение. Предметы не теряются."), "ghost", "w-full")}
            </div>
            {state.winner && (
              <div className="mt-3 border border-flame/50 bg-flame/10 px-3 py-2 font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">
                {state[state.winner].name} побеждает
              </div>
            )}
          </div>

          {/* ХРОНИКА ДУЭЛИ — под действиями, новые сверху, как в бою */}
          <div className="mt-4 border border-line bg-black/45 p-4">
            <div className="sc mb-2">Хроника дуэли</div>
            <div className="max-h-[38vh] space-y-1.5 overflow-y-auto pr-1 text-[0.98rem] leading-snug xl:max-h-[46vh]">
              {state.log
                .map((line, idx) => ({ line, idx, type: state.logTypes?.[idx] ?? null }))
                .slice(-40)
                .reverse()
                .map(({ line, idx, type }) => {
                  const mine = line.startsWith(myName);
                  const theirs = line.startsWith(foeName);
                  /* Строка с уроном окрашена типом урона, как в журнале боя. */
                  const color = type ? { color: DAMAGE_NUMBER_COLORS[type] } : undefined;
                  return (
                    <div
                      key={`${state.seq}-${idx}`}
                      style={color}
                      className={`border-l-2 pl-2 ${mine ? "border-flamedim text-parch" : theirs ? "border-rubric text-parch/85" : "border-line text-mute italic"}`}
                    >
                      {line}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* СОПЕРНИК — правая колонка, как противник в бою */}
        <div className="order-1 min-w-0 xl:order-3 xl:col-start-3 xl:border-l xl:border-line">
          <FoeCard f={foe} tab={foeTab} onTab={setFoeTab} floats={floatsOf(me === "a" ? "b" : "a")} player={sideOf(me === "a" ? "b" : "a")} />
        </div>
      </div>
    </div>
  );
}

export function DuelsTab({ online, openId, setOpenId }: { online: OnlineSession; openId: string | null; setOpenId: (id: string | null) => void }) {
  const myId = online.profile?.id ?? "";
  const [duels, setDuels] = useState<DuelSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await online.api.duels();
      setDuels(res.duels);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить дуэли");
    }
  };
  useSync(load, { live: online.live, scopes: ["duel"], ms: 3000, enabled: !!myId && !openId });

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      if (ok) setError(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const incoming = duels.filter((d) => d.status === "pending" && d.opponentId === myId);
  const outgoing = duels.filter((d) => d.status === "pending" && d.challengerId === myId);
  const active = duels.filter((d) => d.status === "active");
  const past = duels.filter((d) => d.status === "finished" || d.status === "declined" || d.status === "cancelled");
  const current = useMemo(() => duels.find((d) => d.id === openId) ?? null, [duels, openId]);

  if (openId && current && current.status === "active") {
    return <DuelRoom online={online} duelId={openId} onExit={() => setOpenId(null)} onFinished={load} />;
  }

  return (
    <div className="space-y-4">
      <ErrorBar error={error} onClose={() => setError(null)} />

      {active.length > 0 && (
        <Panel title="Идёт дуэль" hint="На каждый ход даётся 20 секунд, иначе ход пропускается">
          {active.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2 last:border-0">
              <span className="font-display text-[1rem] uppercase tracking-[0.04em] text-parch">
                <Versus d={d} />
              </span>
              <div className="flex items-center gap-3 font-mono text-[0.84rem] text-mute">
                <span>раунд {d.round}</span>
                <button onClick={() => setOpenId(d.id)} className="border border-flame bg-flame/20 px-3 py-1 text-flamehi">
                  на арену
                </button>
              </div>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Вам бросили вызов" hint={`${incoming.length} ждут ответа`}>
        {incoming.length === 0 ? (
          <EmptyNote>Вызовов нет. Найдите соперника во вкладке «Игроки».</EmptyNote>
        ) : (
          incoming.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2 last:border-0">
              <span className="inline-flex items-center gap-2 font-display text-[1rem] uppercase tracking-[0.04em] text-flamehi">
                <PlayerPortrait id={d.challengerId} name={d.challengerName} version={d.challengerPortrait} size={32} />
                {d.challengerName}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => run(() => online.api.acceptDuel(d.id))}
                  disabled={busy}
                  className="border border-verd/60 bg-verd/10 px-3 py-1 font-mono text-[0.82rem] text-verd hover:bg-verd/20 disabled:opacity-40"
                >
                  принять
                </button>
                <button
                  onClick={() => run(() => online.api.declineDuel(d.id))}
                  disabled={busy}
                  className="border border-line px-3 py-1 font-mono text-[0.82rem] text-mute hover:border-rubric hover:text-rubric disabled:opacity-40"
                >
                  отказаться
                </button>
              </div>
            </div>
          ))
        )}
      </Panel>

      {outgoing.length > 0 && (
        <Panel title="Ваши вызовы" hint="Ожидают ответа соперника">
          {outgoing.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2 last:border-0">
              <span className="inline-flex items-center gap-2 font-mono text-[0.9rem] text-parch">
                →
                <PlayerPortrait id={d.opponentId} name={d.opponentName} version={d.opponentPortrait} size={28} />
                {d.opponentName}
              </span>
              <button
                onClick={() => run(() => online.api.cancelDuel(d.id))}
                disabled={busy}
                className="border border-line px-3 py-1 font-mono text-[0.82rem] text-mute hover:border-rubric hover:text-rubric disabled:opacity-40"
              >
                снять вызов
              </button>
            </div>
          ))}
        </Panel>
      )}

      {past.length > 0 && (
        <Panel title="История дуэлей">
          <ul className="space-y-1.5 font-mono text-[0.86rem] text-mute">
            {past.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 pb-1">
                <span>
                  <Versus d={d} />
                </span>
                <span className={d.winner === myId ? "text-verd" : ""}>
                  {STATUS_LABEL[d.status]}
                  {d.winner ? (d.winner === myId ? " · победа" : " · поражение") : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
