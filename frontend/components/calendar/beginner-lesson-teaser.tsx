"use client"

import { SECTION_CARD, SECTION_CARD_TITLE } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"
import type { BeginnerLesson } from "@/app/(main)/calendar/beginner-lessons"
import {
  CAT,
  type Category,
  type NewsItem,
} from "@/app/(main)/calendar/news-data"

/** AiSummaryCard 아래에 붙는 보조 카드 — 이번 주 실제 일정에서 고른 교육 주제 1개를 살짝 보여주고, 클릭하면 팝업으로 이어진다 */
export function BeginnerLessonTeaser({
  data,
  tags,
  onOpen,
}: {
  data: { lesson: BeginnerLesson; matchedEvent: NewsItem } | null
  tags: Category[]
  onOpen: () => void
}) {
  if (!data) return null
  const { lesson, matchedEvent } = data

  return (
    <div className={SECTION_CARD}>
      <div className={cn(SECTION_CARD_TITLE, "mb-3")}>
        <span className="shrink-0">🐣</span>
        이번 주, 주린이 탈출
      </div>

      <p className="text-[12px] leading-snug break-keep text-foreground">
        {lesson.hookQuestion}
      </p>

      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
        이번 주 핵심 일정 ·{" "}
        <span className="font-medium text-foreground">
          {matchedEvent.title}
        </span>
      </p>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((c) => (
            <span
              key={c}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                CAT[c].badge
              )}
            >
              #{CAT[c].label}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 inline-flex cursor-pointer items-center gap-1 rounded-full bg-point px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-point/90"
      >
        3분 만에 알아보기
      </button>
    </div>
  )
}
