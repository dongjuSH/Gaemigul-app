"use client"

import { cn } from "@/lib/utils"
import { format, isSameDay, isSameMonth } from "date-fns"
import { useMemo } from "react"
import type { MarketHoliday, NewsItem } from "@/app/(main)/calendar/news-data"
import { dayGroupOf, type DayGroup } from "@/app/(main)/calendar/news-panel"
import { getMonthGridWeeks, WEEKDAY_LABELS } from "@/lib/calendar"
import { EventRow } from "./event-row"

export function MonthGrid({
  month,
  today,
  selectedDate,
  news,
  allNews,
  holidays,
  onSelectDate,
  onOpenDay,
  onOpenItem,
}: {
  month: Date
  today: Date
  selectedDate: Date
  news: NewsItem[]
  allNews: NewsItem[]
  holidays: MarketHoliday[]
  onSelectDate: (d: Date) => void
  onOpenDay: (d: Date) => void
  onOpenItem: (g: DayGroup, itemId: string) => void
}) {
  const weeks = useMemo(() => getMonthGridWeeks(month), [month])

  const openItem = (n: NewsItem) => {
    const g = dayGroupOf(n.publishedAt, allNews)
    if (g) onOpenItem(g, n.id)
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-175 flex-col">
        <div className="grid grid-cols-6 border-b pb-2">
          {WEEKDAY_LABELS.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-muted-foreground sm:text-sm"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-6 gap-px overflow-hidden bg-muted">
          {weeks.flat().map((d) => {
            const inMonth = isSameMonth(d, month)
            // 그리드에 걸치는 전달/다음달 여분 날짜는 일정을 표시하지 않는다
            const dayNews = inMonth
              ? news
                  .filter((n) => isSameDay(n.publishedAt, d))
                  .sort(
                    (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()
                  )
              : []
            const holiday = holidays.find((h) => isSameDay(h.date, d))
            const holidayRows = holiday ? 1 : 0
            const total = holidayRows + dayNews.length
            const showAll = total <= 3
            const visibleCount = showAll
              ? dayNews.length
              : Math.max(0, 2 - holidayRows)
            const visibleNews = dayNews.slice(0, visibleCount)
            const hiddenCount = total - (holidayRows + visibleNews.length)
            const isToday = isSameDay(d, today)
            const isSelected = isSameDay(d, selectedDate)

            return (
              <div
                key={+d}
                className={cn(
                  "flex min-h-24 flex-col gap-0.5 p-1 sm:min-h-28 sm:p-1.5",
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-950/40"
                    : inMonth
                      ? "bg-card"
                      : "bg-muted/5"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectDate(d)}
                  className={cn(
                    "w-fit cursor-pointer self-start rounded px-1 text-xs font-medium tabular-nums transition-colors sm:text-sm",
                    !inMonth && "text-muted-foreground/40",
                    isToday && "font-bold text-primary",
                    !isToday && inMonth && "text-foreground hover:bg-muted"
                  )}
                >
                  {format(d, "d")}
                  {isToday && (
                    <span className="ml-1 text-[10px] font-semibold">오늘</span>
                  )}
                </button>

                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  {holiday && (
                    <span className="flex items-center gap-1 truncate text-[10px] text-red-500 sm:text-[11px]">
                      📍 {holiday.scope === "domestic" ? "국내" : "해외"} 휴장일
                      ({holiday.label})
                    </span>
                  )}
                  {visibleNews.map((n) => (
                    <EventRow key={n.id} item={n} onClick={() => openItem(n)} />
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenDay(d)}
                      className="cursor-pointer text-left text-[10px] text-muted-foreground hover:text-foreground sm:text-[11px]"
                    >
                      +{hiddenCount}개 더보기
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
