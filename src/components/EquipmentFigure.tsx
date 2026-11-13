import { SLOT_META, SLOT_ORDER, type GearItem, type Player, type Slot } from "../game/types";
import { canWear, gearClassLabel, gearStatReqLabel, RARITY_META, scaledGearStats, slotsForItem } from "../game/content";
import { ItemArt } from "./ItemArt";
import { RARITY_STYLE, RARITY_TEXT, Tag } from "./ui";

/** Центры гнёзд в процентах от картины «Витрувианский человек» (public/images/armory/vitruvian.jpg). */
export const FIGURE_SLOT_POS: Record<Slot, { x: number; y: number }> = {
  head: { x: 50, y: 7 },
  amulet: { x: 50, y: 31 },
  mainHand: { x: 7, y: 28 },
  offHand: { x: 93, y: 28 },
  wrists: { x: 10, y: 38 },
  body: { x: 50, y: 44 },
  ring1: { x: 22, y: 52 },
  ring2: { x: 78, y: 52 },
  feet: { x: 50, y: 86 },
};

/** Данные, которые передаются при перетаскивании: надетая вещь («slot:…») или вещь из сундука («uid:…»). */
export const SLOT_DRAG_PREFIX = "slot:";
export const ITEM_DRAG_PREFIX = "uid:";

/**
 * Силуэт с гнёздами. В гнезде видна только картинка предмета.
 * Клик — подробности (или выбор пустого слота), двойной клик — снять, перетаскивание — в сундук.
 */
export function EquipmentFigure({
  player,
  chosenSlot,
  blockedSlot,
  onInspect,
  onUnequip,
  onChooseSlot,
  onDropItem,
}: {
  player: Player;
  chosenSlot: Slot | null;
  /** Ячейка, занятая двуручным оружием: в неё нельзя ни выбрать, ни надеть. */
  blockedSlot: Slot | null;
  onInspect: (item: GearItem) => void;
  onUnequip: (slot: Slot) => void;
  onChooseSlot: (slot: Slot) => void;
  onDropItem: (uid: string, slot: Slot) => void;
}) {
  return (
    <div className="relative mx-auto aspect-[768/1376] w-full max-w-[340px] select-none overflow-hidden border border-line bg-black">
      <img src="images/armory/vitruvian.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-90" draggable={false} />
      {SLOT_ORDER.map((slot) => {
        const pos = FIGURE_SLOT_POS[slot];
        const item = player.armory.find((entry) => entry.uid === player.equip[slot]);
        const blocked = slot === blockedSlot && !item;
        const selected = chosenSlot === slot;
        const name = item ? scaledGearStats(item).base.name : null;
        return (
          <div
            key={slot}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <button
              type="button"
              draggable={!!item}
              onDragStart={(e) => {
                if (!item) return;
                e.dataTransfer.setData("text/plain", `${SLOT_DRAG_PREFIX}${slot}`);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const data = e.dataTransfer.getData("text/plain");
                if (data.startsWith(ITEM_DRAG_PREFIX)) onDropItem(data.slice(ITEM_DRAG_PREFIX.length), slot);
              }}
              onClick={() => {
                if (item) onInspect(item);
                else if (!blocked) onChooseSlot(slot);
              }}
              onDoubleClick={() => {
                if (item) onUnequip(slot);
              }}
              aria-disabled={blocked || undefined}
              aria-label={
                item
                  ? `${SLOT_META[slot].name}: ${name}. Клик — подробности, двойной клик — снять`
                  : blocked
                    ? `${SLOT_META[slot].name}: занято двуручным оружием`
                    : `${SLOT_META[slot].name}: пусто. Клик — показать вещи для слота`
              }
              title={item ? `${name} — ${SLOT_META[slot].name}` : blocked ? "Занято двуручным оружием" : SLOT_META[slot].name}
              className={`flex h-12 w-12 items-center justify-center border transition-colors sm:h-14 sm:w-14 ${
                item
                  ? "border-flamedim/70 bg-black/70 hover:border-flame"
                  : blocked
                    ? "border-dashed border-line/40 bg-black/60 opacity-50"
                    : selected
                      ? "border-dashed border-flame bg-flame/15"
                      : "border-dashed border-flamedim/50 bg-black/55 hover:border-flame hover:bg-flame/10"
              }`}
              style={item?.identified ? RARITY_STYLE[item.rarity] : undefined}
            >
              {item ? (
                <ItemArt id={item.baseId} name={name ?? undefined} size={40} rarity={item.identified ? item.rarity : undefined} framed={false} />
              ) : (
                <span className="sr-only">{SLOT_META[slot].name}</span>
              )}
            </button>
            {!item && (
              <span className="mt-0.5 whitespace-nowrap font-mono text-[0.66rem] leading-none text-mute/80">
                {blocked ? "двуруч." : SLOT_META[slot].short}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Плитка вещи в сундуке: картинка, название, статус. Перетаскивается в гнездо. */
export function GearTile({
  item,
  player,
  selected = false,
  onInspect,
  onEquip,
}: {
  item: GearItem;
  player: Player;
  selected?: boolean;
  onInspect: () => void;
  onEquip: () => void;
}) {
  const st = scaledGearStats(item);
  const wearable = canWear(item, player);
  const slots = slotsForItem(item);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", `${ITEM_DRAG_PREFIX}${item.uid}`);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onInspect}
      onDoubleClick={() => (wearable ? onEquip() : onInspect())}
      title={`${st.base.name}: клик — подробности, двойной клик — надеть, перетащите на гнездо`}
      aria-label={`${st.base.name}, ${gearClassLabel(item)}, ур. ${item.level ?? 1}`}
      className={`flex min-w-0 flex-col items-center gap-1.5 border bg-slab/80 p-2 text-center transition-colors hover:bg-slab2/80 ${
        selected ? "border-flame" : "border-line"
      }`}
      style={item.identified ? RARITY_STYLE[item.rarity] : undefined}
    >
      <ItemArt id={item.baseId} name={st.base.name} size={56} rarity={item.identified ? item.rarity : undefined} />
      <span className="line-clamp-2 min-h-[2.4em] w-full font-display text-[0.9rem] uppercase leading-tight tracking-[0.04em] text-flamehi">
        {st.base.name}
      </span>
      <span className="flex flex-wrap items-center justify-center gap-1">
        <span className="font-mono text-[0.76rem] text-mute">{slots.map((s) => SLOT_META[s].short).join(" / ")}</span>
        {item.identified ? (
          <span className={`font-mono text-[0.76rem] ${RARITY_TEXT[item.rarity]}`}>{RARITY_META[item.rarity].name}</span>
        ) : (
          <Tag tone="flame">Не исследовано</Tag>
        )}
      </span>
      <span className={`font-mono text-[0.74rem] ${wearable ? "text-mute" : "text-rubric"}`}>{gearStatReqLabel(item)}</span>
    </button>
  );
}

