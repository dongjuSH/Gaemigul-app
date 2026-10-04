"use client"

import { SECTION_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"
import { addMonths, format, isSameDay, isSameMonth, subMonths } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo } from "react"
import {
  getMonthGridWeeks,
  navBtn,
  WEEKDAY_LABELS,
  type ViewMode,
} from "@/lib/calendar"

export function MiniCalendar({
  month,
  today,
  selectedDate,
  viewMode,
  onMonthChange,
  onSelectDate,
  onToday,
}: {
  month: Date
  today: Date
  selectedDate: Date
  viewMode: ViewMode
  onMonthChange: (d: Date) => void
  onSelectDate: (d: Date) => void
  onToday: () => void
}) {
  const weeks = useMemo(() => getMonthGridWeeks(month), [month])

  return (
    <div className={SECTION_CARD}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold whitespace-nowrap tabular-nums">
          {format(month, "yyyy년 M월")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToday}
            className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(subMonths(month, 1))}
            aria-label="이전 달"
            className={navBtn}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            aria-label="다음 달"
            className={navBtn}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 text-center text-[11px] text-muted-foreground">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="flex flex-col gap-y-1">
        {weeks.map((week) => {
          // 주별 뷰에서는 선택된 날짜가 속한 주 전체를 한 줄로 강조
          const isActiveWeek =
            viewMode === "week" && week.some((d) => isSameDay(d, selectedDate))
          return (
            <div
              key={+week[0]}
              className={cn(
                "grid grid-cols-6 rounded-full text-center text-xs transition-colors",
                isActiveWeek && "bg-red-500/10"
              )}
            >
              {week.map((d) => {
                const inMonth = isSameMonth(d, month)
                const isToday = isSameDay(d, today)
                const isSelected = isSameDay(d, selectedDate)
                return (
                  <button
                    key={+d}
                    type="button"
                    onClick={() => onSelectDate(d)}
                    className={cn(
                      "mx-auto flex size-7 cursor-pointer items-center justify-center rounded-full tabular-nums transition-colors",
                      !inMonth && "text-muted-foreground/25",
                      inMonth &&
                        !isToday &&
                        !isSelected &&
                        "text-foreground hover:bg-muted",
                      isSelected &&
                        !isToday &&
                        "bg-primary/15 font-semibold text-primary",
                      isToday && "bg-red-500 font-semibold text-white"
                    )}
                  >
                    {format(d, "d")}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
