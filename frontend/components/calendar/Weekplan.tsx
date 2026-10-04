"use client"

import { SECTION_CARD, SECTION_CARD_TITLE } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"
import { CAT, type NewsItem } from "@/app/(main)/calendar/news-data"

/** 이번 주 실제 일정 목록을 받아 카테고리별 요약 형태로 보여주는 카드 (실제 AI 생성 로직은 아직 없음 — 백엔드가 만든 요약 문구를 그대로 사용) */
export function WeekPlan({
  items,
  onOpenItem,
}: {
  items: NewsItem[]
  onOpenItem: (item: NewsItem) => void
}) {
  const isEmpty = items.length === 0

  return (
    <div className={SECTION_CARD}>
      <div className={cn(SECTION_CARD_TITLE, "mb-3 truncate whitespace-nowrap")}>
        <span className="shrink-0">{isEmpty ? "🍃" : "✨"}</span>
        {isEmpty
          ? "이번 주는 예정된 일정이 없어요"
          : "이번 주엔 이런 일정이 있어요"}
      </div>
      {isEmpty ? (
        <p className="text-[11px] text-muted-foreground">
          다음 주에 다시 확인해보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              {/* 요약이 길면 카드 안에서 다 안 보이므로, 클릭하면 상세 팝업으로 전체 내용을 볼 수 있게 한다 */}
              <button
                type="button"
                onClick={() => onOpenItem(n)}
                className="flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border bg-card p-2 text-left transition-colors hover:border-primary/20 hover:bg-primary/5"
              >
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      CAT[n.category].dot
                    )}
                  />
                  <span className="truncate">{n.title}</span>
                </div>
                <p className="line-clamp-2 pl-3 text-[11px] leading-snug break-keep text-muted-foreground">
                  {n.summary}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
