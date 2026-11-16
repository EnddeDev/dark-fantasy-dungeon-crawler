import { useEffect, useMemo, useState } from "react";
import { EffectsTab, SummaryTabs, type SummaryTab } from "../../components/BattleView";
import { Btn, Meter } from "../../components/ui";
import { ARCHETYPES } from "../../game/archetypes";
import { ATTACK_KIND_META, ATTACK_KINDS, MAX_CONCENTRATION, SPECIAL_CONCENTRATION, type AttackKind } from "../../game/battle";
import {
  DUEL_DRAIN_SHARE,
  DUEL_GUARD_ARMOR,
  DUEL_POTION_HEAL,
  duelActionError,
  duelAttackCost,
  duelConcentrationDelta,
  duelHitChance,
  duelTechniqueCost,
  type DuelAction,
  type DuelFighter,
  type DuelState,
} from "../../game/duel";
import type { TabEffect } from "../../game/effectEntries";
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
const concText = (delta: number) => (delta === 0 ? "Концентрация 0" : `Концентрация ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`);

/** Эффекты бойца как строки вкладки «Эффекты»: защита и щит — свои, остальное — от соперника. */
function fighterEffects(f: DuelFighter): TabEffect[] {
  const out: TabEffect[] = [];
  if (f.guard) out.push({ id: "guard", name: "Защита", detail: `Броня +${DUEL_GUARD_ARMOR} до начала своего хода.`, meta: "до своего хода" });
  if (f.invulnerable) out.push({ id: "invulnerable", name: "Неуязвимость", detail: "Урон не проходит до начала своего хода.", meta: "до своего хода" });
  if (f.bulwarkBonus > 0) out.push({ id: "bulwark", name: "Щит", detail: `Следующий удар получит +${f.bulwarkBonus} урона.`, meta: "до удара" });
  f.effects.forEach((e, i) => {
    const detail =
      e.kind === "burn"
        ? `Горение: ${e.value} урона в каждом раунде.`
        : e.kind === "drain"
          ? `Иссушение: ${pct(DUEL_DRAIN_SHARE)} макс. ОЗ в раунд, иссушающий получает столько же.`
          : e.kind === "chill"
            ? `Обморожение: урон −${e.value}%.`
            : `Раскол: броня −${e.value}.`;
    out.push({ id: `effect-${i}-${e.kind}`, name: e.name, detail, meta: `${e.rounds} р.`, negative: true });
  });
  return out;
}

/** Сводка характеристик в два столбца, как в бою. */
function fighterRows(f: DuelFighter): { label: string; value: string }[] {
  const hands = f.hands.map((h) => h.name).join(" + ");
  return [
    { label: "Оружие", value: f.weaponName },
    { label: "Удары", value: `${f.hands.length} (${hands})` },
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

function FighterCard({
  f,
  tone,
  tab,
  onTab,
  turnLabel,
}: {
  f: DuelFighter;
  tone: "verd" | "rubric";
  tab: SummaryTab;
  onTab: (t: SummaryTab) => void;
  turnLabel?: string;
}) {
  const effects = fighterEffects(f);
  return (
    <div className={`relative border p-4 ${tone === "verd" ? "border-verd/40 bg-verd/5" : "border-rubric/40 bg-rubric/5"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`font-display text-lg uppercase tracking-[0.14em] ${tone === "verd" ? "text-verd" : "text-rubric"}`}>{f.name}</h3>
        <span className="font-mono text-[0.84rem] text-mute">ур. {f.level}</span>
      </div>
      <span className="font-mono text-[0.84rem] text-mute">
        оружие: <b className="text-parch">{f.weaponName}</b>
      </span>
      {turnLabel && <div className="mt-1 font-mono text-[0.8rem] text-flamehi">{turnLabel}</div>}
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
        <span className="sc text-rubric">Здоровье</span>
        <Meter value={Math.max(0, f.hp)} max={f.maxHp} tone="rubric" />
        <span className="font-mono text-sm tab text-parch">{Math.max(0, f.hp)}/{f.maxHp}</span>
        <span className="sc text-flamedim">Выносливость</span>
        <Meter value={f.stamina} max={f.staminaMax} tone="flame" />
        <span className="font-mono text-sm tab text-parch">{f.stamina}/{f.staminaMax}</span>
      </div>
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
        <SummaryTabs value={tab} onChange={onTab} effectsCount={effects.length} />
        {tab === "stats" ? (
          <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[0.94rem]">
            {fighterRows(f).map((row) => (
              <div key={row.label} className="flex justify-between gap-2 border-b border-line/40 pb-1">
                <span className="text-mute">{row.label}</span>
                <span className="text-right font-mono text-parch">{row.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <EffectsTab entries={effects} label="эффекты" />
        )}
      </div>
    </div>
  );
}

/** Арена дуэли: раскладка и правила боя. Сервер хранит состояние и следит за 20 секундами. */
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

  const load = async () => {
    try {
      const res = await online.api.duel(duelId);
      setDuel(res.duel);
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
      setDuel(res.duel);
      if (res.duel.status === "finished") onFinished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ход отклонён");
    } finally {
      setBusy(false);
    }
  };

  if (!duel) {
    return (
      <Panel title="Дуэль" actions={<button onClick={onExit} className="sc text-mute hover:text-flamehi">назад</button>}>
        <ErrorBar error={error} />
        <p className="text-[0.94rem] italic text-mute">Загружаем арену…</p>
      </Panel>
    );
  }

  const state: DuelState = duel.state;
  const me = duel.yourSide;
  const my = state[me];
  const foe = state[me === "a" ? "b" : "a"];
  const myTurn = state.turn === me && !state.winner;
  const special = my.archetype ? ARCHETYPES[my.archetype].special : null;
  /* Кнопки закрываются тем же правилом, что проверяет сервер: подсказка всегда про реальную причину. */
  const blockOf = (action: DuelAction) => (state.winner ? "Дуэль окончена" : duelActionError(state, me, action));
  const missOf = (kind: AttackKind) => Math.round((1 - duelHitChance(my, foe, kind)) * 100);
  const attackCost = duelAttackCost(my);
  const techCost = duelTechniqueCost(my);
  const barLabel = state.winner ? null : myTurn ? "Ваш ход" : "Ход соперника…";

  const actionBtn = (action: DuelAction, label: string, title: string | undefined, tone: "flame" | "verd" | "ghost" | "danger" = "ghost") => {
    const block = blockOf(action);
    return (
      <Btn tone={block ? "ghost" : tone} disabled={!!block || busy} title={block ?? title} onClick={() => act(action)}>
        {label}
      </Btn>
    );
  };

  return (
    <Panel
      title={`Дуэль · ${my.name} против ${foe.name}`}
      hint={`Раунд ${state.round} · ходов осталось ${Math.max(0, state.apLeft)} · на ход 20 секунд`}
      actions={
        <div className="flex items-center gap-3">
          {!state.winner && <Countdown deadline={state.deadline} />}
          <button onClick={onExit} className="sc text-mute hover:text-flamehi">
            назад
          </button>
        </div>
      }
    >
      <ErrorBar error={error} onClose={() => setError(null)} />

      <div className="grid items-start xl:grid-cols-3">
        {/* ДЕЙСТВИЯ — центр: удары, приём и спец-приём, рюкзак, защита, пропуск, сдача */}
        <div className="order-1 min-w-0 border-b border-line p-4 sm:p-6 xl:order-2 xl:col-start-2 xl:border-b-0">
          <div className="border border-line bg-slab/95 p-4">
            <h3 className="sc mb-3 text-flamedim">Действия</h3>
            {barLabel && !myTurn && (
              <div className="mb-3 h-2 w-full overflow-hidden bg-black/50">
                <div className="h-full w-1/3 animate-pulse bg-rubric/60" />
              </div>
            )}
            {barLabel && <div className="mb-2 font-mono text-[0.86rem] text-mute">{barLabel}</div>}

            <div className="grid grid-cols-3 gap-2">
              {ATTACK_KINDS.map((kind) => {
                const meta = ATTACK_KIND_META[kind];
                return (
                  <div key={kind}>
                    {actionBtn(
                      { type: "attack", kind },
                      meta.short,
                      `Выносливость: ${attackCost}. ${concText(duelConcentrationDelta({ type: "attack", kind }))}. Шанс промахнуться: ${missOf(kind)}%`,
                      kind === "safe" ? "verd" : "flame",
                    )}
                  </div>
                );
              })}
            </div>

            <div className={`mt-2 grid gap-2 ${special ? "grid-cols-2" : "grid-cols-1"}`}>
              {actionBtn(
                { type: "technique" },
                my.skill ? `Приём «${my.skill.name}» · ${techCost}` : "Приём",
                my.skill ? `Выносливость: ${techCost}. ${concText(-1)}. Перезарядка: ${my.cooldown > 0 ? my.cooldown : my.skill?.cooldown ?? 0} р.` : "У оружия нет приёма",
                "flame",
              )}
              {special &&
                actionBtn(
                  { type: "archetype_skill" },
                  `Спец-приём: ${special.name} · ${my.concentration}/${MAX_CONCENTRATION}`,
                  `${special.desc} ${concText(-SPECIAL_CONCENTRATION)}. Выносливость не тратится.`,
                  "flame",
                )}
            </div>
            {special && <p className="mb-2 mt-1 text-[0.85rem] leading-snug text-mute">{special.desc}</p>}

            <div className="mt-2 grid grid-cols-3 gap-2">
              {actionBtn({ type: "potion" }, `Зелье · ${my.potions}`, `Выносливость: ${STAMINA_BACKPACK}. ${concText(1)}. Лечит ${DUEL_POTION_HEAL} ОЗ.`)}
              {actionBtn({ type: "guard" }, `Защита · ${STAMINA_GUARD}`, `Выносливость: ${STAMINA_GUARD}. ${concText(2)}. Броня +${DUEL_GUARD_ARMOR} до своего хода. Ход не заканчивается.`, "verd")}
              {actionBtn({ type: "pass" }, "Пропуск хода", "Заканчивает ход без действия.")}
            </div>
            <div className="mt-2">
              {actionBtn({ type: "flee" }, "Сдаться", "Засчитывается поражение. Предметы не теряются.", "ghost")}
            </div>
            {state.winner && (
              <div className="mt-3 border border-flame/50 bg-flame/10 px-3 py-2 font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">
                {state[state.winner].name} побеждает
              </div>
            )}
          </div>

          {/* ХРОНИКА — под действиями, как в бою */}
          <div className="mt-3">
            <div className="sc mb-1">Хроника дуэли</div>
            <div className="max-h-56 space-y-1 overflow-y-auto border border-line bg-black/40 px-3 py-2 text-[0.94rem] leading-snug">
              {state.log.slice(-40).map((line, i) => (
                <div key={i} className={line.includes("побежда") ? "text-flame" : line.includes("критич") ? "text-rubric" : "text-parch/85"}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ГЕРОЙ — левая колонка */}
        <div className="order-2 min-w-0 border-b border-line p-4 sm:p-6 xl:order-1 xl:col-start-1 xl:border-b-0">
          <FighterCard f={my} tone="verd" tab={heroTab} onTab={setHeroTab} turnLabel={myTurn ? "ваш ход" : undefined} />
        </div>

        {/* СОПЕРНИК — правая колонка: характеристики видны полностью */}
        <div className="order-3 min-w-0 border-b border-line p-4 sm:p-6 xl:order-3 xl:col-start-3 xl:border-b-0">
          <FighterCard f={foe} tone="rubric" tab={foeTab} onTab={setFoeTab} turnLabel={!myTurn && !state.winner ? "ходит" : undefined} />
        </div>
      </div>
    </Panel>
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
                {d.challengerName} против {d.opponentName}
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
              <span className="font-display text-[1rem] uppercase tracking-[0.04em] text-flamehi">{d.challengerName}</span>
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
              <span className="font-mono text-[0.9rem] text-parch">→ {d.opponentName}</span>
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
                  {d.challengerName} против {d.opponentName}
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
