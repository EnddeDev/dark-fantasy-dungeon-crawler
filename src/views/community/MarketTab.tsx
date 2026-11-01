import { useState } from "react";
import { ItemArt } from "../../components/ItemArt";
import type { Player } from "../../game/types";
import type { OnlineSession } from "../../net/online";
import type { MarketListing } from "../../net/protocol";
import { EmptyNote, ErrorBar, Panel, gearName, useLoader } from "./shared";

/** Рынок: игроки выставляют снаряжение за золото, остальные покупают. */
export function MarketTab({ online, player }: { online: OnlineSession; player: Player }) {
  const market = useLoader(() => online.api.market(), { listings: [] as MarketListing[] });
  const [uid, setUid] = useState("");
  const [price, setPrice] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const equipped = new Set(Object.values(player.equip ?? {}).filter((x): x is string => typeof x === "string"));
  const sellable = player.armory.filter((item) => !equipped.has(item.uid));
  const listings = market.data.listings.filter((l) => (onlyMine ? l.mine : true));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setNotice(ok);
      await market.refresh();
      // Сервер уже изменил золото и арсенал — подтягиваем актуального героя.
      await online.reload();
    } catch (err) {
      market.setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBar error={market.error} onClose={() => market.setError(null)} />
      {notice && <div className="border border-verd/50 bg-verd/10 px-3 py-2 text-[0.94rem] text-verd">{notice}</div>}

      <Panel title="Выставить лот" hint="Предмет уходит с витрины в эскроу и вернётся, если снять лот. Надетые вещи выставлять нельзя.">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1">
            <span className="sc mb-1 block">Снаряжение</span>
            <select
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              className="w-full border border-line bg-soot px-2 py-2 font-mono text-sm text-parch outline-none focus:border-flamedim"
            >
              <option value="">— выберите предмет —</option>
              {sellable.map((item) => (
                <option key={item.uid} value={item.uid}>
                  {gearName(item)} · ур. {item.level ?? 1}
                </option>
              ))}
            </select>
          </label>
          <label className="w-32">
            <span className="sc mb-1 block">Цена</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="0"
              className="w-full border border-line bg-soot px-2 py-2 font-mono text-sm text-parch outline-none focus:border-flamedim"
            />
          </label>
          <button
            onClick={async () => {
              const value = Number(price);
              if (!uid || !value) {
                market.setError("Выберите предмет и укажите цену");
                return;
              }
              await run(() => online.api.sell(uid, value), "Лот выставлен на рынке");
              setUid("");
              setPrice("");
            }}
            disabled={busy || !sellable.length}
            className="border border-flame bg-flame/20 px-4 py-2 font-display text-sm uppercase tracking-[0.1em] text-flamehi disabled:opacity-40"
          >
            Выставить
          </button>
        </div>
        {!sellable.length && <p className="mt-2 text-[0.9rem] italic text-mute">В арсенале нет свободных вещей — снимите снаряжение или добудьте новое.</p>}
      </Panel>

      <Panel
        title="Рынок"
        hint={`${listings.length} лотов · продавцы получают золото сразу после покупки`}
        actions={
          <div className="flex items-center gap-2 font-mono text-[0.82rem] text-mute">
            <button onClick={() => setOnlyMine(false)} className={onlyMine ? "hover:text-flamehi" : "text-flamehi"}>
              все
            </button>
            <span>/</span>
            <button onClick={() => setOnlyMine(true)} className={onlyMine ? "text-flamehi" : "hover:text-flamehi"}>
              мои
            </button>
            <button onClick={market.refresh} className="ml-2 hover:text-flamehi">
              обновить
            </button>
          </div>
        }
      >
        {listings.length === 0 ? (
          <EmptyNote>Витрина пуста. Выставьте первый лот — другие игроки увидят его сразу.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {listings.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-black/30 px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ItemArt id={l.item.baseId} name={l.itemName} size={38} rarity={l.item.identified ? l.item.rarity : undefined} />
                  <div className="min-w-0">
                    <div className="truncate font-display text-[1rem] uppercase tracking-[0.04em] text-parch">{l.itemName}</div>
                    <div className="font-mono text-[0.82rem] text-mute">
                      ур. {l.item.level ?? 1} · продаёт {l.sellerName}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[1.05rem] text-flamehi">{l.price} зол.</span>
                  {l.mine ? (
                    <button
                      onClick={() => run(() => online.api.cancelListing(l.id), "Лот снят, предмет вернулся в арсенал")}
                      disabled={busy}
                      className="border border-line px-2 py-1 font-mono text-[0.8rem] text-mute hover:border-rubric hover:text-rubric disabled:opacity-40"
                    >
                      снять
                    </button>
                  ) : (
                    <button
                      onClick={() => run(() => online.api.buy(l.id), `Куплено: ${l.itemName}`)}
                      disabled={busy || player.gold < l.price}
                      title={player.gold < l.price ? "Недостаточно золота" : undefined}
                      className="border border-verd/60 bg-verd/10 px-3 py-1 font-mono text-[0.82rem] text-verd hover:bg-verd/20 disabled:opacity-40"
                    >
                      купить
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
