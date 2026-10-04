import { cn } from "cn"

import { Badge } from "@/components/ui"
import type { LLMSummary, SummaryAccent } from "@/lib/types/TimelineType"
import GlossaryText from "./GlossaryText"
import SummaryInfoTooltip from "./SummaryInfoTooltip"

const accentBarClassName: Record<SummaryAccent, string> = {
  red: "before:bg-point",
  orange: "before:bg-amber-500",
  green: "before:bg-emerald-500",
}

const accentBadgeClassName: Record<SummaryAccent, string> = {
  red: "bg-point text-white",
  orange: "bg-amber-500 text-white",
  green: "bg-emerald-500 text-white",
}

type LLMSummarySectionProps = {
  summary: LLMSummary
  glossary: Record<string, string>
}

export default function LLMSummarySection({
  summary,
  glossary,
}: LLMSummarySectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1.5 text-lg font-bold text-foreground">
            <span aria-hidden>⚡</span>
            {summary.title}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            <GlossaryText text={summary.subtitle} glossary={glossary} />
          </p>
        </div>
        <SummaryInfoTooltip />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {summary.points.map((point) => (
          <div
            key={point.id}
            className={cn(
              "relative flex flex-col gap-2 rounded-lg border border-border bg-card p-4 before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-lg before:content-['']",
              accentBarClassName[point.accent]
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-card-foreground">
                {point.title}
              </span>
              <Badge
                className={cn(
                  "text-[10px]",
                  accentBadgeClassName[point.accent]
                )}
              >
                {point.badgeLabel}
              </Badge>
            </div>
            <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              <GlossaryText text={point.description} glossary={glossary} />
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
