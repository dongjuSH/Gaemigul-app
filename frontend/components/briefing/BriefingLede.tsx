import type { BriefingTakeawayPoint } from "@/lib/types/BriefingType"

import { Separator } from "../ui"

type BriefingLedeProps = {
  lead: string
  points: BriefingTakeawayPoint[]
  /** points 중 "확인 중" 배지에 붙일 안내 문구 */
  reviewMessage?: string
}

export default function BriefingLede({ lead, points, reviewMessage }: BriefingLedeProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-4 before:absolute before:top-0 before:left-0 before:h-full before:w-1 before:bg-point before:content-['']">
        <p className="text-xl font-bold text-card-foreground">{lead}</p>
        <Separator className="my-3 bg-border/50" />
        <p className="text-basic flex items-center gap-1.5 font-bold text-point">
          <span aria-hidden>📌</span>
          오늘의 핵심 요약 프리뷰
        </p>
        <ul className="flex flex-col gap-1.5">
          {points.map((point) => (
            <li
              key={point.id}
              className="flex items-center gap-1.5 text-sm leading-relaxed text-card-foreground"
            >
              <span className="text-point">•</span>
              {point.text}
              {point.isChecking && (
                <span
                  title={reviewMessage}
                  className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                >
                  확인 중
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
