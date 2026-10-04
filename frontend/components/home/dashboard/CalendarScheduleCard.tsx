"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { isSameDay } from "date-fns"
import { CalendarDays, ChevronRight } from "lucide-react"

import { Button, Skeleton } from "@/components/ui"
import { CategoryBar } from "@/components/calendar/category-bar"
import { RegionBadge } from "@/components/calendar/region-badge"
import { getCalendarEvents } from "@/lib/api/calendar"
import { announceLabel } from "@/lib/calendar"
import { toNewsItem, type NewsItem } from "@/app/(main)/calendar/news-data"
import DashboardCard from "./DashboardCard"

export default function CalendarScheduleCard() {
  const today = useMemo(() => new Date(), [])
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(false)
      try {
        const dtos = await getCalendarEvents(
          today.getFullYear(),
          today.getMonth() + 1
        )
        if (cancelled) return
        const todayItems = dtos
          .map(toNewsItem)
          .filter((n): n is NewsItem => n !== null)
          .filter((n) => isSameDay(n.publishedAt, today))
          .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
        setItems(todayItems)
      } catch (error) {
        console.error("[getCalendarEvents] 실패", error)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [today])

  return (
    <DashboardCard
      icon={<CalendarDays size={16} className="text-point" />}
      title="오늘의 이벤트 일정"
      action={
        <Button
          render={<Link href="/calendar" />}
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="text-neutral-400"
        >
          전체 보기
          <ChevronRight size={14} />
        </Button>
      }
    >
      {loading ? (
        // 일정 한 줄(시각 / 분류 막대·지역 배지 / 제목)과 같은 모양의 뼈대
        <ul
          role="status"
          aria-label="오늘의 이벤트 일정 불러오는 중"
          className="flex flex-col gap-1"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex items-center gap-3 py-2.5">
              <Skeleton className="h-3.5 w-16 shrink-0" />
              <Skeleton className="h-4 w-1 shrink-0" />
              <Skeleton className="h-4 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </li>
          ))}
        </ul>
      ) : loadError ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-400">
          오늘은 예정된 일정이 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 border-b border-neutral-50 py-2.5 last:border-b-0 dark:border-neutral-800"
            >
              {/* "오후 9시 30분"처럼 긴 시각도 줄바꿈되지 않게 고정 폭 대신 최소 폭 + nowrap */}
              <span className="min-w-12 shrink-0 text-xs font-semibold whitespace-nowrap text-neutral-500 dark:text-neutral-400">
                {item.hasTime ? announceLabel(item.publishedAt).trim() : "시간 미정"}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <CategoryBar category={item.category} />
                <RegionBadge region={item.region} />
                <span className="min-w-0 truncate text-sm text-neutral-700 dark:text-neutral-300">
                  {item.title}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
