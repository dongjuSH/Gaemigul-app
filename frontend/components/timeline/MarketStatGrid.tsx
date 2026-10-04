import { ArrowRight } from "lucide-react"
import { cn } from "cn"

import type { MarketStatGroup } from "@/lib/types/TimelineType"
import { formatValueDelta } from "./utils"

type MarketStatGridProps = {
  groups: MarketStatGroup[]
}

export default function MarketStatGrid({ groups }: MarketStatGridProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {groups.map((group) => (
        <div key={group.groupLabel} className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-medium text-neutral-400">
            {group.groupLabel}
          </span>
          <div className="flex min-w-0 flex-wrap gap-3 md:flex-nowrap">
            {group.stats.map((stat) => (
              <div
                key={`${group.groupLabel}-${stat.label}`}
                className={cn(
                  "min-w-0 flex-1 basis-[calc(50%-0.375rem)] rounded-lg border border-border bg-card px-4 py-3",
                  // 장중 변화 카드(07:30 대비 줄이 붙는 카드)는 모바일에서 반 폭이면 좁아서 한 줄 전체를 쓴다
                  stat.previousValue && "max-md:basis-full"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {stat.label}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      stat.isPositive ? "text-increase" : "text-decrease"
                    )}
                  >
                    {stat.rate}
                  </span>
                </div>
                <strong className="mt-1 block text-lg font-bold text-card-foreground">
                  {stat.value}
                </strong>
                {stat.previousValue && (
                  <div className="mt-1.5 flex items-center gap-2 border-t border-neutral-100 pt-1.5 text-[11px] dark:border-border">
                    <span className="flex items-center gap-1">
                      <span className="text-neutral-400">
                        {stat.previousLabel ?? "07:30"}
                      </span>
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                        {stat.previousValue}
                      </span>
                    </span>
                    <ArrowRight
                      size={10}
                      className="shrink-0 text-neutral-300"
                    />
                    <span
                      className={cn(
                        "font-semibold",
                        stat.isPositive ? "text-increase" : "text-decrease"
                      )}
                    >
                      {formatValueDelta(stat.value, stat.previousValue)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
