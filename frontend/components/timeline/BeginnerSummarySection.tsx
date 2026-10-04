import { Separator } from "@/components/ui"
import type { BeginnerSummary } from "@/lib/types/TimelineType"
import GlossaryText from "./GlossaryText"

type BeginnerSummarySectionProps = {
  summary: BeginnerSummary
  glossary: Record<string, string>
}

export default function BeginnerSummarySection({
  summary,
  glossary,
}: BeginnerSummarySectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-lg font-bold text-decrease">
        <span aria-hidden>🌱</span>
        주린이를 위한 해설
      </div>
      {summary.title && (
        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          {summary.title}
        </p>
      )}
      {summary.subtitle && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{summary.subtitle}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {summary.points.map((point, index) => (
          <div
            key={point.id}
            className="relative flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-lg before:bg-decrease before:content-['']"
          >
            {/* 위: 타이틀+설명 / 아래: 구분선+태그 - 카드 높이가 달라도 태그 줄이 바닥에 맞춰진다 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-decrease/10 text-[10px] font-bold text-decrease">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-card-foreground">{point.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                <GlossaryText text={point.description} glossary={glossary} />
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Separator />
              <div className="flex flex-wrap gap-1.5">
                {point.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-500 dark:font-semibold dark:text-neutral-700"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
