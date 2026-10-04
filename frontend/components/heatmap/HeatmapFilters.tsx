"use client"

import { useEffect, useState } from "react"
import { Clock3, LayoutGrid, List, Lock, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SEGMENT_LIST, SEGMENT_TRIGGER } from "@/lib/constant/surface"
import {
  formatCountdown,
  isAfterMarketClose,
  PERIOD_LABELS,
} from "@/lib/heatmap-format"
import type {
  HeatmapMarket,
  HeatmapPeriod,
  HeatmapView,
} from "@/lib/types/HeatmapType"
import { cn } from "@/lib/utils"

const MARKETS = ["kospi", "kosdaq"] as const
const PERIODS = ["day", "week", "month"] as const
// 모바일 탭 크기 - 글자 12px, 여백을 줄이고 줄 폭을 꽉 채운다 (PC는 공통 알약 탭 그대로)
const MOBILE_TAB_LIST = "max-md:w-full"
const MOBILE_TAB = "max-md:px-2 max-md:py-1 max-md:text-xs"

const VIEWS = [
  { value: "map", label: "지도", Icon: LayoutGrid },
  { value: "list", label: "목록", Icon: List },
] as const

export default function HeatmapFilters({
  market,
  period,
  onMarketChange,
  onPeriodChange,
  nextUpdateAt,
  manualRefreshDisabled,
  isLoading,
  refreshWaitSeconds,
  onRefresh,
  view,
  onViewChange,
}: {
  market: HeatmapMarket
  period: HeatmapPeriod
  onMarketChange: (market: HeatmapMarket) => void
  onPeriodChange: (period: HeatmapPeriod) => void
  nextUpdateAt: string | null | undefined
  manualRefreshDisabled: boolean
  isLoading: boolean
  refreshWaitSeconds: number
  onRefresh: () => void
  view: HeatmapView
  onViewChange: (view: HeatmapView) => void
}) {
  const isCoolingDown = refreshWaitSeconds > 0
  const [marketClosed, setMarketClosed] = useState(isAfterMarketClose)
  const [remainingMs, setRemainingMs] = useState(() =>
    nextUpdateAt ? Date.parse(nextUpdateAt) - Date.now() : null
  )

  useEffect(() => {
    function tick() {
      setMarketClosed(isAfterMarketClose())
      setRemainingMs(
        nextUpdateAt ? Date.parse(nextUpdateAt) - Date.now() : null
      )
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [nextUpdateAt])

  const updateDisabled = manualRefreshDisabled || marketClosed

  return (
    // 모바일: 바깥 두 겹을 display:contents로 풀어서, 탭 묶음이 히트맵 페이지 전체 높이 안에서 sticky로 붙어 있게 한다
    // (부모가 탭 높이뿐이면 sticky가 바로 같이 스크롤돼 버린다). PC는 그대로 한 줄 배치
    <div className="max-md:contents">
      <div className="flex flex-wrap items-center justify-between gap-3 max-md:contents">
        {/* 모바일 탭 묶음: [코스피/코스닥 | 지도/목록] 5:5 한 줄 + 아래 [일일/주간/월간] 전체 폭, 헤더 아래에 고정 */}
        <div className="flex flex-wrap gap-2.5 max-md:sticky max-md:top-(--header-height) max-md:z-20 max-md:-mx-4 max-md:mb-3 max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:bg-background max-md:px-4 max-md:py-2">
          <Tabs
            value={market}
            onValueChange={(value) => onMarketChange(value as HeatmapMarket)}
            className="max-md:col-start-1 max-md:row-start-1"
          >
            <TabsList
              aria-label="시장 선택"
              className={cn(SEGMENT_LIST, MOBILE_TAB_LIST)}
            >
              {MARKETS.map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(SEGMENT_TRIGGER, MOBILE_TAB)}
                >
                  {value.toUpperCase()}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs
            value={period}
            onValueChange={(value) => onPeriodChange(value as HeatmapPeriod)}
            className="max-md:col-span-2 max-md:row-start-2"
          >
            <TabsList
              aria-label="기간 선택"
              className={cn(SEGMENT_LIST, MOBILE_TAB_LIST)}
            >
              {PERIODS.map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(SEGMENT_TRIGGER, MOBILE_TAB)}
                >
                  {PERIOD_LABELS[value]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {/* 지도/목록 보기 전환 - 기간 탭 바로 오른쪽 */}
          <Tabs
            value={view}
            onValueChange={(value) => onViewChange(value as HeatmapView)}
            className="max-md:col-start-2 max-md:row-start-1"
          >
            <TabsList
              aria-label="보기 방식"
              className={cn(SEGMENT_LIST, MOBILE_TAB_LIST)}
            >
              {VIEWS.map(({ value, label, Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(SEGMENT_TRIGGER, "gap-1.5", MOBILE_TAB)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5 max-md:mb-5 md:justify-start">
          {!marketClosed && remainingMs !== null && (
            <span
              className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 tabular-nums dark:text-neutral-400"
              aria-label="다음 자동 갱신까지 남은 시간"
            >
              <Clock3 className="size-3.5" />
              다음 갱신까지 {formatCountdown(remainingMs)}
            </span>
          )}
          <Button
            size="sm"
            disabled={updateDisabled}
            onClick={onRefresh}
            aria-label={
              marketClosed
                ? "장 마감 이후에는 업데이트할 수 없습니다"
                : isCoolingDown
                  ? `${refreshWaitSeconds}초 후 수동 업데이트 가능`
                  : "최신 히트맵 다시 확인"
            }
            title={
              marketClosed
                ? "정규장 마감(15:30) 이후에는 업데이트할 수 없습니다."
                : "수동 업데이트는 1분에 한 번 가능합니다."
            }
            className="h-10 rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-white tabular-nums hover:bg-neutral-700 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:opacity-100 max-md:h-8 max-md:rounded-full dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400"
          >
            {marketClosed || isCoolingDown ? (
              <Lock />
            ) : (
              <RefreshCw
                className={isLoading ? "motion-safe:animate-spin" : ""}
              />
            )}
            {marketClosed
              ? "장 마감"
              : isCoolingDown
                ? `${refreshWaitSeconds}초`
                : "새로고침"}
          </Button>
        </div>
      </div>
      {marketClosed && (
        <p className="mt-3 text-xs leading-5 text-neutral-500 max-md:-mt-2 max-md:mb-5 dark:text-neutral-400">
          장 마감 이후에는 마지막 수집 시세를 표시합니다.{" "}
          <br className="md:block" />
          다음 정규장에 갱신됩니다.
        </p>
      )}
    </div>
  )
}
