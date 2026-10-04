import { cn } from "@/lib/utils"
import {
  addDays,
  differenceInCalendarWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { ko } from "date-fns/locale/ko"
import type { Category, CategoryGroupId } from "@/app/(main)/calendar/news-data"

export type ViewMode = "week" | "month"
export type RegionFilter = "all" | "domestic" | "overseas"
export type GroupFilter = "all" | CategoryGroupId

export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토"]

export const navBtn =
  "cursor-pointer text-muted-foreground transition-colors hover:text-foreground"

/** 월~토 6칸(일요일 제외) 주 단위 그리드 — 해당 월이 걸친 주 전체 */
export function getMonthGridWeeks(monthAnchor: Date): Date[][] {
  const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 })
  const weeks: Date[][] = []
  for (let cur = start; cur <= end; cur = addDays(cur, 7)) {
    weeks.push(Array.from({ length: 6 }, (_, i) => addDays(cur, i)))
  }
  return weeks
}

/** 월 기준 몇 번째 주인지 (월요일 시작) */
export function weekOfMonth(d: Date, monthAnchor: Date): number {
  const firstWeekStart = startOfWeek(startOfMonth(monthAnchor), {
    weekStartsOn: 1,
  })
  const thisWeekStart = startOfWeek(d, { weekStartsOn: 1 })
  return (
    differenceInCalendarWeeks(thisWeekStart, firstWeekStart, {
      weekStartsOn: 1,
    }) + 1
  )
}

/**
 * 날짜가 속한 주의 "N월 M주" 라벨을 구한다.
 *
 * 월요일 시작 주(월~토, 6일)가 두 달에 걸치면 날짜가 더 많이 속한 달을 그 주의 "주인 달"로 본다.
 * 6일짜리 주는 목요일(4번째 날)이 항상 더 많은 쪽(과반)에 속하므로 목요일이 속한 달을 주인 달로
 * 쓰면 된다(예: 7/27~8/1은 7월이 5일·8월이 1일이라 7월이 주인 달) — 정확히 3:3으로 갈리는 경우도
 * 목요일 기준(ISO 8601과 동일한 방식)으로 자연스럽게 정해진다.
 *
 * weekNo는 weekOfMonth(d, 그 달)처럼 "그 달 1일이 속한 주"를 1주로 세지 않는다 — 그 주는 실제로는
 * 인접 달 소유일 수 있어서(예: 8/1이 속한 주는 7월 소유), 그 기준으로 세면 정작 8월 소유의 첫 주(8/3~8)가
 * "8월 2주"로 밀리는 오류가 생긴다. 대신 그 주의 목요일이 그 달에서 몇 번째 목요일인지로 센다 —
 * 목요일은 정의상 항상 주인 달 안에 있고 이웃 주끼리 정확히 7일 간격이므로, "N월 1주"는 항상 그 달의
 * 목요일이 있는 첫 주가 된다.
 */
export function weekLabelOf(d: Date): { month: Date; weekNo: number } {
  const weekStart = startOfWeek(d, { weekStartsOn: 1 })
  const thursday = addDays(weekStart, 3)
  const month = startOfMonth(thursday)
  const weekNo = Math.floor((thursday.getDate() - 1) / 7) + 1
  return { month, weekNo }
}

/**
 * 이번 달이 "주인"(weekLabelOf 기준)인 주들만 모은 날짜 범위(월요일~토요일)를 구한다.
 * 1일이 속한 주가 이번 달 소유가 아니면(전달 소유) 다음 주부터 시작하고, 말일이 속한 주가 이번 달
 * 소유가 아니면(다음 달 소유) 그 전 주까지만 포함한다 — 예를 들어 8/1이 속한 주(7월 소유)는 8월
 * 범위에서 빠지고 7월 범위에 포함되며, 8/31이 속한 주(9월 소유)는 8월 범위에서 빠지고 9월 범위에
 * 포함된다. 그래서 경계에 살짝 걸친 날짜가 두 달에 겹쳐 보이거나 아예 안 보이는 일이 없다.
 */
export function weekOwnedRangeOfMonth(month: Date): { start: Date; end: Date } {
  const firstWeekStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const start = isSameMonth(weekLabelOf(firstWeekStart).month, month)
    ? firstWeekStart
    : addDays(firstWeekStart, 7)

  const lastWeekStart = startOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const end = isSameMonth(weekLabelOf(lastWeekStart).month, month)
    ? addDays(lastWeekStart, 5)
    : addDays(lastWeekStart, -2)

  return { start, end }
}

/** '오후 9시 30분 발표 예정' 형태로 변환 (정각이면 분 생략) */
export function announceLabel(d: Date): string {
  const base = format(d, "a h시", { locale: ko })
  const min = d.getMinutes()
  return min === 0 ? `${base} ` : `${base} ${min}분 `
}

export const segBtn = (active: boolean) =>
  cn(
    "cursor-pointer rounded-full px-3 py-1.5 whitespace-nowrap transition-colors",
    active
      ? "bg-point font-semibold text-white"
      : "text-neutral-500 hover:text-foreground dark:text-neutral-400"
  )

// 앱(모바일)에서는 줄을 꽉 채우도록 늘어나고, 웹(lg 이상)에서는 원래대로 콘텐츠 너비만 차지
export const groupSegBtn = (active: boolean) =>
  cn(segBtn(active), "flex-1 text-center lg:flex-none")

export function toggleCategory(set: Set<Category>, value: Category) {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}
