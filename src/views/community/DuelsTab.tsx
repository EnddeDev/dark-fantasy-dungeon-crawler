import { useEffect, useMemo, useState } from "react";
import { Btn, Meter } from "../../components/ui";
import type { DuelAction, DuelState } from "../../game/duel";
import type { OnlineSession } from "../../net/online";
import type { DuelDetail, DuelSummary } from "../../net/protocol";
import { EmptyNote, ErrorBar, Panel, usePoll } from "./shared";

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

/** Арена дуэли: бой идёт по полным правилам, сервер хранит состояние и следит за 20 секундами. */
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
  usePoll(load, 1200, true);

  const act = async (action: DuelAction) => {
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
  const skill = my.skill;

  return (
    <Panel
      title={`Дуэль · ${my.name} против ${foe.name}`}
      hint={`Раунд ${state.round} · действий осталось ${Math.max(0, state.apLeft)} · на ход 20 секунд`}
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

      <div className="grid gap-3 sm:grid-cols-2">
        {[my, foe].map((f, i) => (
          <div key={f.userId} className={`border p-2.5 ${i === 0 ? "border-verd/40 bg-verd/5" : "border-rubric/40 bg-rubric/5"}`}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-display text-[1rem] uppercase tracking-[0.04em] text-parch">{f.name}</span>
              <span className="font-mono text-[0.82rem] text-mute">ур. {f.level}</span>
            </div>
            <Meter value={Math.max(0, f.hp)} max={f.maxHp} tone={i === 0 ? "verd" : "rubric"} />
            <div className="mt-1 flex justify-between font-mono text-[0.84rem] text-mute">
              <span>{Math.max(0, f.hp)}/{f.maxHp} ОЗ</span>
              <span>броня {f.armor} · уклон {Math.round(f.evade * 100)}%</span>
            </div>
            <div className="mt-1 font-mono text-[0.8rem] text-mute">
              {f.weaponName} · урон {f.hit[0]}–{f.hit[1]} +{f.strFlat} · крит {Math.round(f.crit * 100)}% ×{f.critDamage.toFixed(1)}
            </div>
            <div className="font-mono text-[0.8rem] text-mute">
              зелья {f.potions}
              {f.guard ? " · в защите" : ""}
              {f.cooldown > 0 ? ` · приём через ${f.cooldown}` : ""}
            </div>
          </div>
        ))}
      </div>

      {state.winner ? (
        <div className="mt-3 border border-flame/50 bg-flame/10 px-3 py-2 font-display text-[1.05rem] uppercase tracking-[0.08em] text-flamehi">
          {state[state.winner].name} побеждает
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn tone="flame" disabled={!myTurn || busy} onClick={() => act({ type: "attack" })}>
            Удар
          </Btn>
          <Btn
            disabled={!myTurn || busy || !skill || my.intStat < skill.intReq || my.cooldown > 0}
            onClick={() => act({ type: "technique" })}
            title={
              !skill
                ? "У оружия нет приёма"
                : my.intStat < skill.intReq
                  ? `Нужен Интеллект ${skill.intReq}`
                  : my.cooldown > 0
                    ? `Перезарядка ${my.cooldown}`
                    : undefined
            }
          >
            {skill ? `Приём «${skill.name}»` : "Приём"}
          </Btn>
          <Btn tone="verd" disabled={!myTurn || busy} onClick={() => act({ type: "guard" })}>
            Защита
          </Btn>
          <Btn disabled={!myTurn || busy || my.potions <= 0} onClick={() => act({ type: "potion" })}>
            Зелье · {my.potions}
          </Btn>
          <Btn disabled={!myTurn || busy} onClick={() => act({ type: "pass" })}>
            Пропустить
          </Btn>
          {!myTurn && <span className="self-center font-mono text-[0.86rem] text-mute">ход соперника…</span>}
        </div>
      )}

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
  usePoll(load, 3000, !!myId && !openId);

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
