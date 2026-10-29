import type { ReactNode } from "react";
import { Check, Eye, Lock, Sparkles, Sword } from "lucide-react";
import {
  EPIC_SKILLS,
  GEAR_CLASS_META,
  LEGENDARY_PASSIVES,
  RARITY_META,
  RARE_AFFIXES,
  STAT_META,
  WEAR_META,
  WEAR_RANGE,
  gearBuyPrice,
  gearSellPrice,
  gearClassFor,
  gearStatReq,
  identifyReqs,
  scaledGearStats,
  slotsForItem,
} from "../game/content";
import { derived } from "../game/battle";
import { GEAR_EFFECTS, GEAR_PASSIVES } from "../game/gearEffects";
import { SLOT_META } from "../game/types";
import type { GearItem, Player } from "../game/types";
import { ItemArt } from "./ItemArt";
import { Btn, Modal, RARITY_TEXT, Tag } from "./ui";

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3">
      <h3 className="sc mb-2 text-[0.86rem] text-flamedim">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-[0.98rem] text-mute">{label}</dt>
      <dd className="text-right font-mono text-[0.98rem] tab text-parch">{value}</dd>
    </div>
  );
}

/** Полный разбор открывается кнопкой карточки, а не наведением мыши. */
export function GearNote({
  item,
  player,
  onClose,
  inShop = false,
  onIdentify,
}: {
  item: GearItem;
  player: Player;
  onClose: () => void;
  inShop?: boolean;
  onIdentify?: (uid: string, mode: "int" | "gold") => void;
}) {
  const st = scaledGearStats(item);
  const d = derived(player);
  const level = item.level ?? 1;
  const req = gearStatReq(item);
  const research = identifyReqs(item);
  const researchInt = Math.max(1, research.int - d.intDiscount);
  const range = WEAR_RANGE[item.wear];
  const allowed = slotsForItem(item);
  const wornIn = allowed.filter((slot) => player.equip[slot] === item.uid);
  const compareSlot = allowed.find((slot) => player.equip[slot] && player.equip[slot] !== item.uid) ?? allowed[0];
  const compared = player.armory.find((entry) => entry.uid === player.equip[compareSlot]);
  const other = !wornIn.length && compared && compared.uid !== item.uid ? scaledGearStats(compared) : null;
  const skill = st.skill;
  const skillInt = skill ? Math.max(1, skill.intReq - d.intDiscount) : 0;
  const skillOpen = !!skill && player.stats.int >= skillInt;
  const statOk = player.stats[req.stat] >= req.value;
  const levelOk = player.level >= level;
  const spread = Math.round((item.statMult - 1) * 100);
  const avg = (range?: [number, number]) => range ? (range[0] + range[1]) / 2 : 0;
  const deltas = other ? [
    { label: "Средний урон", value: Math.round((avg(st.dmg) - avg(other.dmg)) * 10) / 10 },
    { label: "Броня", value: st.armor - other.armor },
    { label: "Здоровье", value: st.hp - other.hp },
    { label: "Уклонение, п.п.", value: Math.round((st.evade - other.evade) * 100) },
  ].filter((entry) => entry.value !== 0) : [];

  return (
    <Modal
      title={st.base.name}
      sub="Полная информация о предмете"
      onClose={onClose}
      actions={<Btn onClick={onClose}>Закрыть</Btn>}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <ItemArt id={item.baseId} name={st.base.name} size={76} rarity={item.identified ? item.rarity : undefined} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <Tag>{GEAR_CLASS_META[gearClassFor(item)].name}</Tag>
              <Tag>Уровень {level}</Tag>
              <Tag tone={item.wear === "new" ? "verd" : item.wear === "battered" ? "rubric" : "mute"}>{WEAR_META[item.wear].name}</Tag>
              {item.identified ? (
                <span className={`border border-line px-1.5 py-[3px] font-mono text-[0.86rem] leading-none ${RARITY_TEXT[item.rarity]}`}>{RARITY_META[item.rarity].name}</span>
              ) : <Tag tone="flame">Редкость неизвестна</Tag>}
              {wornIn.length > 0 && <Tag tone="verd">Надето: {wornIn.map((slot) => SLOT_META[slot].short).join(", ")}</Tag>}
            </div>
            <p className="mt-2 text-[1rem] italic leading-relaxed text-mute">{st.base.desc}</p>
          </div>
        </div>

        <DetailSection title="Требования и ячейки">
          <div className="flex flex-wrap gap-2">
            <Tag tone={statOk ? "verd" : "rubric"}>{STAT_META[req.stat].name}: {player.stats[req.stat]}/{req.value} {statOk ? "✓" : "✗"}</Tag>
            <Tag tone={levelOk ? "verd" : "rubric"}>Уровень персонажа: {player.level}/{level} {levelOk ? "✓" : "✗"}</Tag>
          </div>
          <p className="mt-2 text-[0.96rem] leading-relaxed text-mute">
            Ячейки: {allowed.map((slot) => SLOT_META[slot].name).join(" / ")}.
            {st.base.hands === 2 && " Двуручное оружие занимает обе руки."}
          </p>
        </DetailSection>

        <DetailSection title="Характеристики этого экземпляра">
          <dl>
            {st.dmg && <Row label="Урон оружия" value={`${st.dmg[0]}–${st.dmg[1]}`} />}
            {st.armor > 0 && <Row label="Броня" value={`+${st.armor}`} />}
            {st.hp > 0 && <Row label="Здоровье" value={`+${st.hp}`} />}
            {st.evade > 0 && <Row label="Уклонение" value={`+${Math.round(st.evade * 100)}%`} />}
            <Row label="Состояние" value={`${WEAR_META[item.wear].name} · ×${st.wearMult.toFixed(3)}`} />
            <Row label="Диапазон состояния" value={`×${range.lo}–${range.hi}, базовый ×${range.base}`} />
            <Row label="Разброс параметров" value={`${spread > 0 ? "+" : ""}${spread}%`} />
            {item.dmgRoll && <Row label="Разброс клинка" value={`${st.base.dmg?.[0]}–${st.base.dmg?.[1]} → ${item.dmgRoll[0]}–${item.dmgRoll[1]}`} />}
            <Row label={inShop ? "Цена покупки" : "Цена продажи"} value={`${inShop ? gearBuyPrice(item) : gearSellPrice(item)} зол.`} />
          </dl>
        </DetailSection>

        {other && (
          <DetailSection title={`Сравнение с надетым: ${other.base.name}`}>
            {deltas.length ? (
              <dl>{deltas.map((delta) => (
                <div key={delta.label} className="flex justify-between gap-3 py-1 text-[0.98rem]">
                  <dt className="text-mute">{delta.label}</dt>
                  <dd className={`font-mono tab ${delta.value > 0 ? "text-verd" : "text-rubric"}`}>{delta.value > 0 ? "+" : ""}{delta.value}</dd>
                </div>
              ))}</dl>
            ) : <p className="text-[0.97rem] text-mute">Базовые параметры совпадают.</p>}
            <p className="mt-1 text-[0.9rem] leading-snug text-mute">Сравниваются базовые параметры вещей; итоговые значения также зависят от характеристик и эффектов персонажа.</p>
          </DetailSection>
        )}

        {skill && (
          <DetailSection title="Приём оружия">
            <div className="border-l-2 border-flamedim bg-black/25 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 font-display text-[1.08rem] uppercase tracking-[0.05em] text-flamehi"><Sword size={15} aria-hidden />{skill.name}</h4>
                <span className={`flex items-center gap-1 font-mono text-[0.9rem] ${skillOpen ? "text-verd" : "text-rubric"}`}>
                  {skillOpen ? <Check size={13} aria-hidden /> : <Lock size={13} aria-hidden />} ИНТ {skillInt} · {skillOpen ? "открыт" : "закрыт"}
                </span>
              </div>
              <p className="mt-2 text-[1rem] leading-relaxed text-parch/90">{skill.desc}</p>
              <p className="mt-1.5 text-[0.94rem] leading-relaxed text-mute">{skill.passiveNote}</p>
              <p className="mt-1.5 font-mono text-[0.9rem] text-mute">Откат: {skill.cooldown}. Масштабирование: {STAT_META[skill.scaleStat].short} ×{skill.scaleMult}.</p>
            </div>
          </DetailSection>
        )}

        <DetailSection title="Свойства и способности">
          {!item.identified ? (
            <div className="border border-dashed border-flamedim/60 bg-black/25 p-3">
              <h4 className="flex items-center gap-2 font-display text-[1.08rem] uppercase tracking-[0.05em] text-flame"><Eye size={16} aria-hidden />Качество скрыто туманом</h4>
              <p className="mt-2 text-[0.98rem] leading-relaxed text-mute">
                {inShop
                  ? "Редкость, дополнительные свойства и способности станут известны после покупки и исследования в арсенале."
                  : "Исследуйте предмет, чтобы раскрыть редкость, дополнительные свойства и способности."}
              </p>
              {!inShop && onIdentify && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn tone="verd" disabled={player.stats.int < researchInt} onClick={() => onIdentify(item.uid, "int")}>
                    Исследовать · ИНТ {researchInt}
                  </Btn>
                  <Btn tone="flame" disabled={player.gold < research.gold} onClick={() => onIdentify(item.uid, "gold")}>
                    Оплатить · {research.gold} зол.
                  </Btn>
                </div>
              )}
              <p className="mt-2 text-[0.9rem] text-mute">Исследование за Интеллект не тратит золото.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {item.rarity === "common" && !item.effects.length && !item.epicSkill && !item.passive && !item.rareAffix && !item.legendaryPassive && (
                <p className="text-[0.98rem] italic text-mute">Обычное качество: дополнительных свойств нет.</p>
              )}
              {item.effects.map((id, index) => {
                const effect = GEAR_EFFECTS[id];
                return effect ? (
                  <div key={`${id}-${index}`} className="border-l-2 border-verd/60 pl-3">
                    <h4 className="font-display text-[1.08rem] uppercase tracking-[0.04em] text-verd">{effect.name}</h4>
                    <p className="mt-1 text-[0.98rem] leading-relaxed text-parch/85">{effect.detail}</p>
                  </div>
                ) : null;
              })}
              {item.rareAffix && (
                <div className="border-l-2 border-verd/60 pl-3">
                  <h4 className="font-display text-[1.08rem] uppercase tracking-[0.04em] text-verd">{RARE_AFFIXES[item.rareAffix].name}</h4>
                  <p className="mt-1 text-[0.98rem] leading-relaxed text-parch/85">{RARE_AFFIXES[item.rareAffix].desc}</p>
                </div>
              )}
              {item.epicSkill && (
                <div className="border-l-2 border-flamedim pl-3">
                  <h4 className="flex items-center gap-2 font-display text-[1.08rem] uppercase tracking-[0.04em] text-flamehi"><Sparkles size={14} aria-hidden />{EPIC_SKILLS[item.epicSkill].name}</h4>
                  <p className="mt-1 text-[0.98rem] leading-relaxed text-parch/85">{EPIC_SKILLS[item.epicSkill].desc}</p>
                  <p className="mt-1 font-mono text-[0.9rem] text-mute">Эпический приём · ИНТ {Math.max(1, EPIC_SKILLS[item.epicSkill].intReq - d.intDiscount)} · откат {EPIC_SKILLS[item.epicSkill].cooldown}</p>
                </div>
              )}
              {item.passive && (
                <div className="border-l-2 border-flamedim pl-3">
                  <h4 className="font-display text-[1.08rem] uppercase tracking-[0.04em] text-flamehi">{GEAR_PASSIVES[item.passive].name}</h4>
                  <p className="mt-1 text-[0.98rem] leading-relaxed text-parch/85">{GEAR_PASSIVES[item.passive].detail}</p>
                </div>
              )}
              {item.legendaryPassive && (
                <div className="border-l-2 border-flamedim pl-3">
                  <h4 className="font-display text-[1.08rem] uppercase tracking-[0.04em] text-flamehi">{LEGENDARY_PASSIVES[item.legendaryPassive].name}</h4>
                  <p className="mt-1 text-[0.98rem] leading-relaxed text-parch/85">{LEGENDARY_PASSIVES[item.legendaryPassive].desc}</p>
                </div>
              )}
            </div>
          )}
        </DetailSection>
      </div>
    </Modal>
  );
}
