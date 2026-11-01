import { useState, type ReactElement } from "react";
import type { Player } from "../../game/types";
import type { OnlineSession } from "../../net/online";
import type { TradeOffer } from "../../net/protocol";
import { EmptyNote, ErrorBar, GearChip, GearPicker, Panel, usePoll } from "./shared";

const STATUS_LABEL: Record<TradeOffer["status"], string> = {
  offered: "ждёт ответа",
  countered: "встречное предложение",
  accepted: "обмен состоялся",
  declined: "отказ",
  cancelled: "отменён",
};

/**
 * Обмены: автор показывает, что отдаёт; получатель либо предлагает встречный набор,
 * либо отказывается. Автор принимает встречное предложение или отклоняет его.
 */
export function TradesTab({ online, player }: { online: OnlineSession; player: Player }) {
  const myId = online.profile?.id ?? "";
  const [trades, setTrades] = useState<TradeOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<TradeOffer | null>(null);
  const [counterItems, setCounterItems] = useState<string[]>([]);
  const [counterMessage, setCounterMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await online.api.trades();
      setTrades(res.trades);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить обмены");
    }
  };
  usePoll(load, 4000, !!myId);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setNotice(ok);
      await load();
      await online.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const incoming = trades.filter((t) => t.toId === myId && t.status === "offered");
  const answered = trades.filter((t) => t.fromId === myId && t.status === "countered");
  const waiting = trades.filter((t) => t.fromId === myId && t.status === "offered");
  const history = trades.filter((t) => ["accepted", "declined", "cancelled"].includes(t.status));

  const cards = (list: TradeOffer[], render: (t: TradeOffer) => ReactElement) => (
    <ul className="space-y-3">
      {list.map((t) => (
        <li key={t.id} className="border border-line bg-black/30 p-3">{render(t)}</li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <ErrorBar error={error} onClose={() => setError(null)} />
      {notice && <div className="border border-verd/50 bg-verd/10 px-3 py-2 text-[0.94rem] text-verd">{notice}</div>}

      {counterFor && (
        <Panel
          title={`Встречное предложение для ${counterFor.fromName}`}
          hint="Выберите вещи, которые отдадите взамен. Они уйдут в эскроу до ответа автора."
          actions={
            <button onClick={() => setCounterFor(null)} className="sc text-mute hover:text-rubric">
              закрыть
            </button>
          }
        >
          <GearPicker
            player={player}
            selected={counterItems}
            onToggle={(uid) => setCounterItems((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]))}
          />
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[220px] flex-1">
              <span className="sc mb-1 block">Комментарий</span>
              <input
                value={counterMessage}
                onChange={(e) => setCounterMessage(e.target.value)}
                maxLength={200}
                className="w-full border border-line bg-soot px-2 py-2 font-mono text-sm text-parch outline-none focus:border-flamedim"
              />
            </label>
            <button
              onClick={async () => {
                if (!counterItems.length) return;
                const target = counterFor;
                setCounterFor(null);
                await run(() => online.api.counterTrade(target.id, counterItems, counterMessage), "Встречное предложение отправлено");
                setCounterItems([]);
                setCounterMessage("");
              }}
              disabled={busy || !counterItems.length}
              className="border border-flame bg-flame/20 px-4 py-2 font-display text-sm uppercase tracking-[0.1em] text-flamehi disabled:opacity-40"
            >
              Ответить обменом
            </button>
          </div>
        </Panel>
      )}

      <Panel title="Вам предлагают" hint={`${incoming.length} предложений ждут ответа`}>
        {incoming.length === 0 ? (
          <EmptyNote>Новых предложений нет.</EmptyNote>
        ) : (
          cards(incoming, (t) => (
            <>
              <div className="mb-2 font-display text-[1.02rem] uppercase tracking-[0.04em] text-flamehi">{t.fromName} предлагает</div>
              <div className="mb-2 flex flex-wrap gap-1.5">{t.offer.map((item) => <GearChip key={item.uid} item={item} />)}</div>
              {t.message && <p className="mb-2 text-[0.94rem] italic text-mute">«{t.message}»</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => run(() => online.api.declineTrade(t.id), "Обмен отклонён")}
                  disabled={busy}
                  className="border border-rubric/60 px-3 py-1.5 font-mono text-[0.84rem] text-rubric hover:bg-rubric/15 disabled:opacity-40"
                >
                  отказаться
                </button>
                <button
                  onClick={() => {
                    setCounterFor(t);
                    setCounterItems([]);
                    setCounterMessage("");
                  }}
                  disabled={busy}
                  className="border border-flame bg-flame/15 px-3 py-1.5 font-mono text-[0.84rem] text-flamehi hover:bg-flame/25 disabled:opacity-40"
                >
                  встречное предложение
                </button>
              </div>
            </>
          ))
        )}
      </Panel>

      <Panel title="Встречные предложения" hint={`${answered.length} ждут вашего решения`}>
        {answered.length === 0 ? (
          <EmptyNote>Пока никто не ответил встречным предложением.</EmptyNote>
        ) : (
          cards(answered, (t) => (
            <>
              <div className="mb-2 font-display text-[1.02rem] uppercase tracking-[0.04em] text-flamehi">
                {t.toName} готов отдать
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">{t.request.map((item) => <GearChip key={item.uid} item={item} />)}</div>
              <p className="mb-2 text-[0.9rem] text-mute">
                Взамен вы отдаёте: {t.offer.map((item) => item.baseId).length ? t.offer.length : 0} предм.
              </p>
              {t.message && <p className="mb-2 text-[0.94rem] italic text-mute">«{t.message}»</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => run(() => online.api.acceptTrade(t.id), "Обмен совершён — предметы в арсенале")}
                  disabled={busy}
                  className="border border-verd/60 bg-verd/10 px-3 py-1.5 font-mono text-[0.84rem] text-verd hover:bg-verd/20 disabled:opacity-40"
                >
                  принять обмен
                </button>
                <button
                  onClick={() => run(() => online.api.declineTrade(t.id), "Встречное предложение отклонено")}
                  disabled={busy}
                  className="border border-rubric/60 px-3 py-1.5 font-mono text-[0.84rem] text-rubric hover:bg-rubric/15 disabled:opacity-40"
                >
                  отказаться
                </button>
              </div>
            </>
          ))
        )}
      </Panel>

      {waiting.length > 0 && (
        <Panel title="Ваши предложения" hint="Ждут ответа получателя">
          {cards(waiting, (t) => (
            <>
              <div className="mb-2 font-display text-[1.02rem] uppercase tracking-[0.04em] text-parch">
                Вы → {t.toName}
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">{t.offer.map((item) => <GearChip key={item.uid} item={item} />)}</div>
              <button
                onClick={() => run(() => online.api.cancelTrade(t.id), "Предложение отменено, предметы вернулись")}
                disabled={busy}
                className="border border-line px-3 py-1.5 font-mono text-[0.84rem] text-mute hover:border-rubric hover:text-rubric disabled:opacity-40"
              >
                отменить
              </button>
            </>
          ))}
        </Panel>
      )}

      {history.length > 0 && (
        <Panel title="История" hint="Последние завершённые обмены">
          <ul className="space-y-1.5 font-mono text-[0.86rem] text-mute">
            {history.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 pb-1">
                <span>
                  {t.fromName} → {t.toName} · {t.offer.length + t.request.length} предм.
                </span>
                <span className={t.status === "accepted" ? "text-verd" : "text-mute"}>{STATUS_LABEL[t.status]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
