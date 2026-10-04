"use client"

import { useEffect, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { ko } from "date-fns/locale/ko"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "cn"

import { getTimelineAvailableDates } from "@/lib/api/timeline"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

function getMonthGrid(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 })

  const days: Date[] = []
  let cursor = start
  while (cursor <= end) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

type TimelineDateHeaderProps = {
  selectedDate: Date
  /** 실데이터가 쌓이기 시작한 가장 이른 날짜. 이전 날짜는 선택할 수 없다. */
  minDate: Date
  /** 조회 가능한 가장 늦은 날짜(보통 오늘). 이후 날짜는 선택할 수 없다. */
  maxDate: Date
  onSelect: (date: Date) => void
}

export default function TimelineDateHeader({
  selectedDate,
  minDate,
  maxDate,
  onSelect,
}: TimelineDateHeaderProps) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(startOfMonth(selectedDate))
  // 조회한 달(month key)과 그 달에 실제 데이터가 있는 날짜 집합. month가 viewMonth와
  // 다르면 아직 그 달을 못 불러온 것 - 이 상태에선 데이터 유무로 막지 않고 날짜 범위만으로
  // 판단해, 달을 넘길 때 전부 비활성으로 깜빡이는 걸 막는다
  const [loadedMonth, setLoadedMonth] = useState<{
    key: string
    dates: Set<string>
  } | null>(null)
  const viewMonthKey = format(viewMonth, "yyyy-MM")

  useEffect(() => {
    let cancelled = false

    getTimelineAvailableDates(viewMonth.getFullYear(), viewMonth.getMonth() + 1)
      .then((dates) => {
        if (!cancelled)
          setLoadedMonth({ key: viewMonthKey, dates: new Set(dates) })
      })
      .catch(() => {
        if (!cancelled) setLoadedMonth({ key: viewMonthKey, dates: new Set() })
      })

    return () => {
      cancelled = true
    }
  }, [viewMonth, viewMonthKey])

  const availableDates =
    loadedMonth?.key === viewMonthKey ? loadedMonth.dates : null

  const days = getMonthGrid(viewMonth)
  const isToday = (date: Date) => isSameDay(date, new Date())
  const isInRange = (date: Date) =>
    date.getTime() >= minDate.getTime() && date.getTime() <= maxDate.getTime()
  // 데이터가 없는 날짜는 막되, "오늘"은 아직 슬롯이 안 쌓였어도 항상 선택할 수 있게 둔다
  // (안 그러면 장 시작 전엔 오늘 날짜도 회색으로 막혀 보인다)
  const isAvailable = (date: Date) => {
    if (!isInRange(date)) return false
    if (isToday(date)) return true
    if (availableDates === null) return true
    return availableDates.has(format(date, "yyyy-MM-dd"))
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setViewMonth(startOfMonth(selectedDate))
      }}
    >
      <Popover.Trigger className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-left transition-colors hover:bg-muted">
        <strong className="text-base font-bold max-md:text-sm">
          {format(selectedDate, "M월 d일", { locale: ko })}
        </strong>
        <ChevronDown
          size={18}
          className={cn(
            "text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </Popover.Trigger>

      <Popover.Portal>
        {/* 모바일에서는 고정 헤더·섹션 탭(sticky) 위에 뜨도록 z-30 */}
        <Popover.Positioner sideOffset={8} align="end" className="max-md:z-30">
          {/* Base UI가 열고 닫힐 때 붙이는 data-starting/ending-style로 통통 튀는 등장·퇴장 효과를 준다 */}
          <Popover.Popup className="w-70 origin-(--transform-origin) rounded-xl border border-border bg-popover p-4 shadow-lg transition-[opacity,scale] duration-300 ease-bounce outline-none data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0">
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="이전 달"
                onClick={() => setViewMonth((month) => subMonths(month, 1))}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-popover-foreground">
                {format(viewMonth, "yyyy년 M월", { locale: ko })}
              </span>
              <button
                type="button"
                aria-label="다음 달"
                onClick={() => setViewMonth((month) => addMonths(month, 1))}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-[11px] text-muted-foreground">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-xs">
              {days.map((day) => {
                const disabled = !isAvailable(day)
                const isSelected = isSameDay(day, selectedDate)
                const isToday = isSameDay(day, new Date())
                const inMonth = isSameMonth(day, viewMonth)

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onSelect(startOfDay(day))
                      setOpen(false)
                    }}
                    className={cn(
                      "mx-auto flex size-8 items-center justify-center rounded-full transition-colors duration-200",
                      !inMonth && "text-muted-foreground/25",
                      disabled
                        ? "cursor-not-allowed text-muted-foreground/40"
                        : "cursor-pointer hover:bg-muted",
                      isSelected &&
                        "bg-point font-semibold text-white hover:bg-point",
                      !isSelected && isToday && "font-semibold text-point",
                      inMonth &&
                        !disabled &&
                        !isSelected &&
                        !isToday &&
                        "text-popover-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </button>
                )
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
