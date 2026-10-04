import { cn } from "cn"

import type {
  BriefingStatCard,
  BriefingStatTone,
} from "@/lib/types/BriefingType"

const toneClassName: Record<BriefingStatTone, string> = {
  increase: "border-point/20 bg-point/5 text-point",
  decrease: "border-decrease/20 bg-decrease/5 text-decrease",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-600",
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
}

type BriefingStatCardsProps = {
  cards: BriefingStatCard[]
}

export default function BriefingStatCards({ cards }: BriefingStatCardsProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cards.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
      )}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "flex h-full flex-col items-start justify-between gap-1.5 rounded-lg border p-4",
            toneClassName[card.tone]
          )}
        >
          <div className="flex flex-col">
            <span className="text-xs font-medium text-neutral-500">
              {card.label}
            </span>
            <strong className="pt-1 text-2xl font-bold">{card.value}</strong>
          </div>
          {card.changeLabel && (
            <span className="h-max w-fit rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold dark:bg-white">
              {card.changeLabel}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
