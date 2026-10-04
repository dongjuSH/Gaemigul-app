import { cn } from "cn"

import { Badge } from "@/components/ui"
import type { SectorItem } from "@/lib/types/TimelineType"
import { isPositiveRate } from "./utils"

type SectorGridProps = {
  sectors: SectorItem[]
}

export default function SectorGrid({ sectors }: SectorGridProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-foreground">주도 섹터</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {sectors.map((sector) => (
          <div
            key={sector.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <span className="text-sm font-semibold text-card-foreground">{sector.name}</span>
            <strong
              className={cn(
                "text-xl font-bold",
                isPositiveRate(sector.rate) ? "text-increase" : "text-decrease"
              )}
            >
              {sector.rate}
            </strong>
            <div className="flex flex-col gap-1.5 border-t border-neutral-100 pt-2 dark:border-border">
              {sector.stocks.map((stock) => (
                <div
                  key={stock.badge || stock.name}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-card-foreground">{stock.name}</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-neutral-500 dark:text-neutral-400"
                    >
                      {stock.badge}
                    </Badge>
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      isPositiveRate(stock.rate)
                        ? "text-increase"
                        : "text-decrease"
                    )}
                  >
                    {stock.rate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
