"use client"

import { useState } from "react"
import { AlertCircle } from "lucide-react"
import { useHeatmap } from "@/hooks/use-heatmap"
import { getVolumePeriodLabel } from "@/lib/heatmap-format"
import type {
  HeatmapMarket,
  HeatmapPeriod,
  HeatmapView,
} from "@/lib/types/HeatmapType"
import HeatmapTopSectorBanner from "./HeatmapTopSectorBanner"
import HeatmapFilters from "./HeatmapFilters"
import HeatmapEmptyState from "./HeatmapEmptyState"
import HeatmapLoadingSkeleton from "./HeatmapLoadingSkeleton"
import HeatmapNewsSection from "./HeatmapNewsSection"
import HeatmapRecommendation from "./HeatmapRecommendation"
import HeatmapTree from "./HeatmapTree"

export default function HeatmapDashboard({
  market,
  period,
  onMarketChange,
  onPeriodChange,
}: {
  market: HeatmapMarket
  period: HeatmapPeriod
  onMarketChange: (market: HeatmapMarket) => void
  onPeriodChange: (period: HeatmapPeriod) => void
}) {
  const { data, isLoading, error, refresh, refreshWaitSeconds } = useHeatmap(
    market,
    period
  )
  const manualRefreshDisabled = isLoading || refreshWaitSeconds > 0
  // 지도/목록 전환 탭은 기간 탭 옆(HeatmapFilters)에, 실제 보기는 HeatmapTree에 있어 여기서 상태를 갖는다
  const [view, setView] = useState<HeatmapView>("map")
  const hasData = Boolean(
    data?.sectors.some(
      (sector) => sector.stocks.length && sector.market_cap > 0
    )
  )
  const topSector = data?.top_sector
  const collecting = data?.is_refreshing
  const coverage = data?.coverage
  const partial = Boolean(coverage?.missing_stocks)
  const periodLabel = getVolumePeriodLabel(period, data?.as_of_date)
  const warning =
    error ||
    (data?.is_stale
      ? "최신 시세를 확인하지 못해 마지막으로 수집한 데이터를 표시합니다."
      : partial
        ? "일부 종목의 시세를 수집 중입니다. 순위와 표시 범위가 달라질 수 있습니다."
        : null)

  return (
    <div className="space-y-5 text-neutral-900 max-md:space-y-6 dark:text-neutral-100">
      <HeatmapTopSectorBanner
        market={market}
        topSector={topSector}
        periodLabel={periodLabel}
        partial={partial}
        isLoading={isLoading}
        collecting={collecting}
      />
      <HeatmapFilters
        market={market}
        period={period}
        onMarketChange={onMarketChange}
        onPeriodChange={onPeriodChange}
        nextUpdateAt={data?.next_update_at}
        manualRefreshDisabled={manualRefreshDisabled}
        isLoading={isLoading}
        refreshWaitSeconds={refreshWaitSeconds}
        onRefresh={refresh}
        view={view}
        onViewChange={setView}
      />
      {warning && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{warning}</p>
        </div>
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-label="주식 히트맵"
          className="min-w-0 rounded-xl border border-heatmap-border bg-heatmap-panel p-4 shadow-sm sm:p-5"
        >
          {hasData && data ? (
            <HeatmapTree sectors={data.sectors} view={view} />
          ) : isLoading && !data ? (
            <HeatmapLoadingSkeleton />
          ) : (
            <HeatmapEmptyState
              error={error}
              collecting={collecting}
              message={data?.message}
              coverage={coverage}
              manualRefreshDisabled={manualRefreshDisabled}
              refreshWaitSeconds={refreshWaitSeconds}
              onRefresh={refresh}
            />
          )}
        </section>
        <HeatmapRecommendation
          topSectorName={topSector?.name}
          relatedSectors={data?.related_sectors ?? []}
          isLoading={isLoading || Boolean(collecting)}
        />
      </div>
      <HeatmapNewsSection market={market} period={period} snapshot={data} />
    </div>
  )
}
