"use client"

import { format } from "date-fns"
import { ko } from "date-fns/locale/ko"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { getAttendanceHeatmap } from "@/lib/api/attendance"
import {
  buildYearGrid,
  colorForVisitedCount,
  tooltipForCell,
  WEEKEND_STRIPE_BACKGROUND,
} from "@/lib/attendance"

// GitHub 스타일과 같이 월/수/금만 라벨을 붙인다(일~토 7행 중 1,3,5번째)
const WEEKDAY_ROW_LABELS = ["", "월", "", "수", "", "금", ""]
const CELL_SIZE = 13
// 실제 칸 사이 간격(gap-[3px])과 값을 맞춰야 한다 - 아래 COLUMN_WIDTH로 월 라벨 위치를 계산할 때 쓰는데,
// 여기서만 바꾸고 JSX의 gap-[3px]들을 안 바꾸면 라벨이 실제 칸 위치와 어긋난다
const CELL_GAP = 3
const COLUMN_WIDTH = CELL_SIZE + CELL_GAP

/** 마이페이지 "굴 파기 기록" - GitHub 컨트리뷰션 그래프를 흙색 톤으로 재해석한 연간 출석 히트맵 */
export function AttendanceHeatmap() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [visitedByDate, setVisitedByDate] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAttendanceHeatmap(year)
      .then((days) => {
        if (cancelled) return
        setVisitedByDate(new Map(days.map((day) => [day.date, day.visited_slots])))
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year])

  const weeks = useMemo(() => buildYearGrid(year, visitedByDate), [year, visitedByDate])

  // 각 주(열) 중 그 달 1일이 포함된 첫 주에만 달 이름을 표시한다
  const monthLabels = useMemo(() => {
    const labels: { weekIndex: number; label: string }[] = []
    let lastMonth = -1
    weeks.forEach((week, weekIndex) => {
      const firstOfMonthCell = week.find((cell) => cell.inYear && cell.date.getDate() === 1)
      if (!firstOfMonthCell) return
      const month = firstOfMonthCell.date.getMonth()
      if (month === lastMonth) return
      lastMonth = month
      labels.push({ weekIndex, label: format(firstOfMonthCell.date, "M월", { locale: ko }) })
    })
    return labels
  }, [weeks])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="이전 해"
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="w-12 text-center text-sm font-medium tabular-nums">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= currentYear}
            aria-label="다음 해"
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          기록을 불러오지 못했어요.
        </p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="flex w-max gap-1">
            <div className="flex flex-col gap-[3px] pt-[18px] pr-1 text-[10px] text-muted-foreground">
              {WEEKDAY_ROW_LABELS.map((label, index) => (
                <span key={index} style={{ height: CELL_SIZE }} className="flex items-center">
                  {label}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-[2px]">
              <div className="relative h-[14px] text-[10px] text-muted-foreground">
                {monthLabels.map(({ weekIndex, label }) => (
                  <span
                    key={weekIndex}
                    className="absolute"
                    style={{ left: weekIndex * COLUMN_WIDTH }}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="flex gap-[3px]">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[3px]">
                    {week.map((cell, dayIndex) => (
                      <div
                        key={dayIndex}
                        title={cell.inYear ? tooltipForCell(cell.date, cell.visitedSlots) : undefined}
                        className="rounded-[2px]"
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          background: !cell.inYear
                            ? "transparent"
                            : cell.isWeekend
                              ? WEEKEND_STRIPE_BACKGROUND
                              : colorForVisitedCount(cell.visitedSlots.length),
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span>적음</span>
        {[0, 1, 3, 5, 7].map((count) => (
          <span
            key={count}
            className="rounded-[2px]"
            style={{ width: CELL_SIZE, height: CELL_SIZE, background: colorForVisitedCount(count) }}
          />
        ))}
        <span>많음</span>
      </div>
    </div>
  )
}
