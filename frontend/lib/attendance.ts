import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  startOfWeek,
  startOfYear,
} from "date-fns"
import { ko } from "date-fns/locale/ko"

export type AttendanceCell = {
  date: Date
  /** 그 해 1/1~12/31 범위 밖(주 정렬용 여백 칸)이면 false - 렌더링에서 제외 */
  inYear: boolean
  isWeekend: boolean
  visitedSlots: string[]
}

/** "0730" -> "07:30" */
export function formatSlotKey(slotKey: string): string {
  return `${slotKey.slice(0, 2)}:${slotKey.slice(2)}`
}

// 방문 슬롯 수(0~8) -> 색 톤 5단계. "흙색 계열 그라데이션 (굴을 파 들어가는 느낌)"
// 실제 값은 globals.css의 --attendance-* 변수(라이트/다크 각각 정의)를 따른다
const INTENSITY_COLORS = [
  "var(--attendance-0)", // 0/8 - 겉흙(미방문)
  "var(--attendance-1)", // 1-2/8
  "var(--attendance-2)", // 3-4/8
  "var(--attendance-3)", // 5-6/8
  "var(--attendance-4)", // 7-8/8 - 깊이 판 굴
]

export function colorForVisitedCount(count: number): string {
  if (count <= 0) return INTENSITY_COLORS[0]
  if (count <= 2) return INTENSITY_COLORS[1]
  if (count <= 4) return INTENSITY_COLORS[2]
  if (count <= 6) return INTENSITY_COLORS[3]
  return INTENSITY_COLORS[4]
}

// 주말(장 없음) 칸 - 회색 줄무늬 (다크모드는 --attendance-weekend-* 변수가 더 어두운 톤으로 바뀐다)
export const WEEKEND_STRIPE_BACKGROUND =
  "repeating-linear-gradient(45deg, var(--attendance-weekend-a), var(--attendance-weekend-a) 3px, var(--attendance-weekend-b) 3px, var(--attendance-weekend-b) 6px)"

/** 해당 연도를 일요일 시작 주 단위 그리드로 만든다(GitHub 컨트리뷰션 그래프와 같은 방식) -
 * 1주 = 7일, 첫/마지막 주는 그 해 밖 날짜로 채워 정렬만 맞추고 렌더링에서 제외한다 */
export function buildYearGrid(
  year: number,
  visitedByDate: Map<string, string[]>
): AttendanceCell[][] {
  const yearStart = startOfYear(new Date(year, 0, 1))
  const yearEnd = endOfYear(yearStart)
  const gridStart = startOfWeek(yearStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(yearEnd, { weekStartsOn: 0 })

  const totalDays = differenceInCalendarDays(gridEnd, gridStart) + 1
  const weeks: AttendanceCell[][] = []

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset += 1) {
    const date = addDays(gridStart, dayOffset)
    const weekIndex = Math.floor(dayOffset / 7)
    if (!weeks[weekIndex]) weeks[weekIndex] = []

    const inYear = date >= yearStart && date <= yearEnd
    const dayOfWeek = getDay(date) // 0=일 ... 6=토
    const key = format(date, "yyyy-MM-dd")

    weeks[weekIndex].push({
      date,
      inYear,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      visitedSlots: visitedByDate.get(key) ?? [],
    })
  }

  return weeks
}

/** hover 툴팁 문구: "9/16 (수) · 5/8 확인 · 07:30, 09:30, 12:00, 14:00, 15:30" */
export function tooltipForCell(date: Date, visitedSlots: string[]): string {
  const dateLabel = format(date, "M/d (EEEEEE)", { locale: ko })
  if (visitedSlots.length === 0) return `${dateLabel} · 방문 기록 없음`
  const timeList = visitedSlots
    .slice()
    .sort()
    .map(formatSlotKey)
    .join(", ")
  return `${dateLabel} · ${visitedSlots.length}/8 확인 · ${timeList}`
}
