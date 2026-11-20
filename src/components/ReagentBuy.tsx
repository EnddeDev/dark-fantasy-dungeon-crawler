import type { Player } from "../game/types";
import { missingReagents, reagentQuote, type ReagentNeed } from "../game/reagentPurchase";
import { Btn } from "./ui";

/**
 * Кнопка «Докупить»: недостающие реагенты до нужного количества и их цена в лавке.
 * Не показывается, если всё на месте.
 */
export function BuyMissingReagents({
  player,
  needs,
  onBuy,
  className = "",
}: {
  player: Player;
  needs: ReagentNeed[];
  onBuy: (needs: ReagentNeed[]) => void;
  className?: string;
}) {
  const lines = missingReagents(player, needs);
  if (lines.length === 0) return null;
  const quote = reagentQuote(player, lines);
  const list = lines.map((line) => `${line.name} ×${line.missing}`).join(", ");
  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="font-mono text-[0.84rem] text-mute">
        Не хватает: <span className="text-parch">{list}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Btn
          tone={quote.canBuy ? "verd" : "ghost"}
          disabled={!quote.canBuy}
          title={quote.reason ?? "Купить недостающие реагенты по цене лавки"}
          onClick={() => onBuy(needs)}
        >
          Докупить · {quote.cost} зол.
        </Btn>
        {!quote.canBuy && quote.reason && <span className="font-mono text-[0.84rem] text-rubric">{quote.reason}</span>}
        {quote.canBuy && quote.couponsUsed > 0 && (
          <span className="font-mono text-[0.84rem] text-verd">скидка 25% по купону</span>
        )}
      </div>
    </div>
  );
}
