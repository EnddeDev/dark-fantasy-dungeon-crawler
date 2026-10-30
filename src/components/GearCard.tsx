import { Check, Coins, Info, Plus } from "lucide-react";
import {
  GEAR_CLASS_META,
  RARITY_META,
  WEAR_META,
  STAT_META,
  canWear,
  gearBuyPrice,
  gearSellPrice,
  gearClassFor,
  gearStatReq,
  gearStatReqLabel,
  scaledGearStats,
  slotsForItem,
  wearRequirementNote,
} from "../game/content";
import { ARCHETYPES } from "../game/archetypes";
import type { GearItem, Player, Slot } from "../game/types";
import { SLOT_META } from "../game/types";
import { ItemArt } from "./ItemArt";
import { Btn, RARITY_STYLE, RARITY_TEXT, Tag } from "./ui";

/** Короткая карточка: приём, чары и сравнение живут только в окне подробностей. */
export function GearCard({
  item,
  player,
  mode,
  slot,
  preferredSlot,
  onInspect,
  onEquip,
  onUnequip,
  onSell,
  onBuy,
  purchased = false,
}: {
  item: GearItem;
  player: Player;
  mode: "equipped" | "inventory" | "shop";
  /** Конкретная ячейка для надетой вещи. */
  slot?: Slot;
  /** Ячейка, выбранная в левой колонке: у кольца останется одна кнопка надевания. */
  preferredSlot?: Slot;
  onInspect: () => void;
  onEquip?: (slot: Slot) => void;
  onUnequip?: (slot: Slot) => void;
  onSell?: () => void;
  onBuy?: () => void;
  purchased?: boolean;
}) {
  const st = scaledGearStats(item);
  const archetype = st.base.archetype ? ARCHETYPES[st.base.archetype] : null;
  const wear = WEAR_META[item.wear];
  const rarity = RARITY_META[item.rarity];
  const possibleSlots = slotsForItem(item);
  const allowed = preferredSlot && possibleSlots.includes(preferredSlot) ? [preferredSlot] : possibleSlots;
  const req = gearStatReq(item);
  const wearable = canWear(item, player);
  const equipped = mode === "equipped";
  const buyPrice = gearBuyPrice(item);
  const compact = equipped;

  return (
    <article
      className={`flex min-w-0 flex-col border bg-slab/90 transition-colors ${compact ? "p-2.5" : "p-3"} ${
        equipped ? "border-l-2 border-l-verd/70" : "hover:bg-slab2/70"
      }`}
      style={{
        ...(item.identified ? RARITY_STYLE[item.rarity] : RARITY_STYLE.common),
        ...(equipped ? { borderLeftColor: "#5f8f7a" } : {}),
      }}
      aria-label={`${st.base.name}${equipped ? ", надето" : ""}`}
    >
      <div className="flex items-start gap-3">
        <ItemArt
          id={item.baseId}
          name={st.base.name}
          size={compact ? 44 : 56}
          rarity={item.identified ? item.rarity : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="sc mb-1 text-[0.84rem] text-flamedim">
            {slot ? SLOT_META[slot].name : allowed.map((s) => SLOT_META[s].short).join(" / ")}
          </div>
          <h4 className="font-display text-[1.08rem] uppercase leading-snug tracking-[0.05em] text-flamehi">
            {st.base.name}
          </h4>
          <p className="mt-1 text-[0.9rem] leading-snug text-mute">
            {GEAR_CLASS_META[gearClassFor(item)].name} · ур. {item.level ?? 1}{archetype ? ` · ${archetype.name}` : ""}
            {st.base.hands === 2 ? " · обе руки" : ""}
          </p>
        </div>
        {equipped && <Check size={16} className="mt-1 shrink-0 text-verd" aria-label="Надето" />}
      </div>

      <div className={`${compact ? "mt-2" : "mt-2.5"} flex flex-wrap items-center gap-1.5`}>
        <Tag tone={item.wear === "new" ? "verd" : item.wear === "worn" ? "mute" : "rubric"}>
          {wear.name}
        </Tag>
        {item.identified ? (
          <span
            className={`border px-1.5 py-[3px] font-mono text-[0.86rem] leading-none ${RARITY_TEXT[item.rarity]}`}
            style={RARITY_STYLE[item.rarity]}
          >
            {rarity.name}
          </span>
        ) : (
          <Tag tone="flame">Не исследовано</Tag>
        )}
        <span className={`ml-auto font-mono text-[0.88rem] ${wearable ? "text-mute" : "text-rubric"}`}>
          {gearStatReqLabel(item)}
        </span>
      </div>

      <div className={`${compact ? "mt-2" : "mt-2.5"} flex flex-wrap gap-x-3 gap-y-1 text-[0.96rem] leading-snug text-parch/90`}>
        {st.dmg && <span>Урон <b className="font-mono text-flamehi">{st.dmg[0]}–{st.dmg[1]}</b></span>}
        {st.armor > 0 && <span>Броня <b className="font-mono text-verd">+{st.armor}</b></span>}
        {st.hp > 0 && <span>ОЗ <b className="font-mono text-parch">+{st.hp}</b></span>}
        {st.evade > 0 && <span>Уклонение <b className="font-mono text-verd">+{Math.round(st.evade * 100)}%</b></span>}
        {!st.dmg && !st.armor && !st.hp && !st.evade && <span className="text-mute">Без базовых бонусов</span>}
      </div>

      {!wearable && mode === "inventory" && (
        <p className="mt-2 text-[0.9rem] leading-snug text-rubric">
          Нужно: {STAT_META[req.stat].short} {req.value} и уровень {item.level ?? 1}.
        </p>
      )}

      <div className={`${compact ? "mt-2 pt-2" : "mt-3 pt-2.5"} flex flex-wrap items-center gap-2 border-t border-line/70`}>
        <Btn className="gap-1.5 px-2.5 py-2 text-[0.86rem]" onClick={onInspect} title={`Подробнее: ${st.base.name}`}>
          <Info size={14} aria-hidden /> Подробнее
        </Btn>
        {mode === "shop" ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span className="flex items-center gap-1 font-mono text-[0.94rem] text-flamehi">
              <Coins size={14} aria-hidden /> {buyPrice}
            </span>
            {purchased ? (
              <Tag tone="verd">Куплено</Tag>
            ) : (
              <Btn tone="flame" className="px-3 py-2" disabled={player.gold < buyPrice} onClick={onBuy}>
                Купить
              </Btn>
            )}
          </div>
        ) : equipped ? (
          <Btn
            tone="danger"
            className="ml-auto px-3 py-2"
            onClick={() => slot && onUnequip?.(slot)}
            title={`Снять: ${st.base.name}`}
          >
            Снять
          </Btn>
        ) : (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {allowed.map((target) => (
              <Btn
                key={target}
                tone="verd"
                className="px-2.5 py-2 text-[0.86rem]"
                disabled={!wearable}
                title={wearable ? `Надеть: ${SLOT_META[target].name}` : wearRequirementNote(item, player)}
                onClick={() => onEquip?.(target)}
              >
                <Plus size={12} aria-hidden /> {allowed.length > 1 ? SLOT_META[target].short : "Надеть"}
              </Btn>
            ))}
            <Btn tone="danger" className="px-2.5 py-2 text-[0.86rem]" onClick={onSell} title={`Продать за ${gearSellPrice(item)} зол.`}>
              Продать
            </Btn>
          </div>
        )}
      </div>
      {mode === "inventory" && (
        <span className="mt-1.5 text-right font-mono text-[0.84rem] text-mute">Продажа: {gearSellPrice(item)} зол.</span>
      )}
    </article>
  );
}
