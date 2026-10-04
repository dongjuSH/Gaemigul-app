"use client"

import { addDays, format, isSameDay, isSameMonth, startOfDay } from "date-fns"
import { ko } from "date-fns/locale/ko"
import { useMemo } from "react"
import type { MarketHoliday, NewsItem } from "@/app/(main)/calendar/news-data"
import { dayGroupOf, type DayGroup } from "@/app/(main)/calendar/news-panel"
import {
  announceLabel,
  weekLabelOf,
  weekOwnedRangeOfMonth,
} from "@/lib/calendar"
import { formatEconomicValue } from "@/lib/format-economic-value"
import { CategoryBar } from "./category-bar"
import { RegionBadge } from "./region-badge"

type DayEntry = { date: Date; news: NewsItem[]; holiday?: MarketHoliday }

export function WeekList({
  month,
  selectedDate,
  news,
  allNews,
  holidays,
  onOpenItem,
  emptyMessage = "표시할 일정이 없습니다",
}: {
  month: Date
  selectedDate: Date
  news: NewsItem[]
  allNews: NewsItem[]
  holidays: MarketHoliday[]
  onOpenItem: (g: DayGroup, itemId: string) => void
  emptyMessage?: string
}) {
  // 이번 달이 "주인"인 주만 범위로 삼는다 — 예: 8/1이 속한 주는 7월 소유라 8월 범위에서 빠지고
  // (7월 범위에만 나타남), 8/31이 속한 주는 9월 소유라 8월 범위에서 빠진다(9월 범위에만 나타남)
  const ownedRange = weekOwnedRangeOfMonth(month)
  // 이번 달을 보는 중이면 '오늘(선택일)'부터, 다른 달이면 이번 달 소유 범위의 시작부터 표시
  const rangeStart =
    isSameMonth(selectedDate, month) &&
    startOfDay(selectedDate) > ownedRange.start
      ? startOfDay(selectedDate)
      : ownedRange.start
  const rangeEnd = ownedRange.end

  const dayEntries = useMemo(() => {
    const entries: DayEntry[] = []
    for (let cur = rangeStart; cur <= rangeEnd; cur = addDays(cur, 1)) {
      const dayNews = news
        .filter((n) => isSameDay(n.publishedAt, cur))
        .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
      const holiday = holidays.find((h) => isSameDay(h.date, cur))
      if (dayNews.length > 0 || holiday) {
        entries.push({ date: new Date(cur), news: dayNews, holiday })
      }
    }
    return entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [+rangeStart, +rangeEnd, news, holidays])

  // 월초/월말 경계 주는 날짜가 더 많이 속한 달 기준으로 묶는다(weekLabelOf) — 예: 7/27~8/1은
  // 7월 날짜가 더 많으므로 8월 뷰에서도 "7월 5주"로 표시되고 "8월 1주"로 새로 넘어가지 않는다
  const weeks = useMemo(() => {
    const map = new Map<
      string,
      { month: Date; weekNo: number; days: DayEntry[] }
    >()
    for (const entry of dayEntries) {
      const { month: ownerMonth, weekNo } = weekLabelOf(entry.date)
      const key = `${ownerMonth.getFullYear()}-${ownerMonth.getMonth()}-${weekNo}`
      const group = map.get(key)
      if (group) {
        group.days.push(entry)
      } else {
        map.set(key, { month: ownerMonth, weekNo, days: [entry] })
      }
    }
    return [...map.values()].sort((a, b) => +a.days[0].date - +b.days[0].date)
  }, [dayEntries])

  if (weeks.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {weeks.map(({ month: ownerMonth, weekNo, days }) => (
        <div key={`${+ownerMonth}-${weekNo}`}>
          <h3 className="mb-2 text-[14px] font-bold text-primary">
            {format(ownerMonth, "M월")} {weekNo}주차
          </h3>
          <div className="overflow-x-auto rounded-lg border">
            {/* 모바일: 고정 레이아웃으로 모든 주차 표의 열 폭을 같게 맞춘다(내용 길이에 따라 열마다 폭이 달라지지 않게).
                넘치는 값은 말줄임 처리 */}
            <table className="w-full min-w-135 text-sm max-md:table-fixed">
              <thead>
                <tr className="border-b bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="w-20 p-2 text-left font-semibold">날짜</th>
                  <th className="p-2 text-left font-semibold">일정</th>
                  <th className="w-36 p-2 text-left font-semibold">
                    발표 시간
                  </th>
                  <th className="w-24 p-2 text-left font-semibold">현재</th>
                  <th className="w-20 p-2 text-left font-semibold">이전</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <DayRows
                    key={+day.date}
                    day={day}
                    allNews={allNews}
                    onOpenItem={onOpenItem}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function DayRows({
  day,
  allNews,
  onOpenItem,
}: {
  day: DayEntry
  allNews: NewsItem[]
  onOpenItem: (g: DayGroup, itemId: string) => void
}) {
  const dateLabel = format(day.date, "d일 (EEE)", { locale: ko })

  const openItem = (n: NewsItem) => {
    const g = dayGroupOf(n.publishedAt, allNews)
    if (g) onOpenItem(g, n.id)
  }

  return (
    <>
      {day.holiday && (
        <tr className="border-b last:border-b-0">
          <td className="p-2 text-left text-[12px] font-medium whitespace-nowrap text-primary">
            {dateLabel}
          </td>
          <td colSpan={4} className="p-2 text-left text-[12px] text-red-500">
            📍 {day.holiday.scope === "domestic" ? "국내" : "해외"} 휴장일 (
            {day.holiday.label})
          </td>
        </tr>
      )}
      {day.news.map((n, i) => (
        <tr key={n.id} className="border-b last:border-b-0">
          {i === 0 && (
            <td
              rowSpan={day.news.length}
              className={`p-2 text-left text-[12px] font-medium whitespace-nowrap text-primary${day.news.length > 1 ? "align-top" : ""}`}
            >
              {dateLabel}
            </td>
          )}
          <td className="p-2 text-left">
            <button
              type="button"
              onClick={() => openItem(n)}
              title={n.title}
              className="flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] transition-colors hover:bg-primary/5 hover:text-primary"
            >
              <CategoryBar category={n.category} />
              <RegionBadge region={n.region} />
              <span className="truncate">{n.title}</span>
            </button>
          </td>
          <td className="p-2 text-left text-[12px] whitespace-nowrap text-muted-foreground">
            {n.hasTime ? announceLabel(n.publishedAt) : "-"}
          </td>
          <td
            className="p-2 text-left text-[12px] whitespace-nowrap"
            title={n.detail?.actual}
          >
            {n.detail?.actual
              ? n.detail.actualLabel
                ? `${n.detail.actualLabel} ${formatEconomicValue(n.detail.actual)}`
                : formatEconomicValue(n.detail.actual)
              : "-"}
          </td>
          <td
            className="p-2 text-left text-[12px] whitespace-nowrap"
            title={n.detail?.previous}
          >
            {formatEconomicValue(n.detail?.previous)}
          </td>
        </tr>
      ))}
    </>
  )
}
