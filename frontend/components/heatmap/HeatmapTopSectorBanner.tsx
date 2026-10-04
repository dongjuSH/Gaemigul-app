import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react"
import { formatChange } from "@/lib/heatmap-layout"
import type { HeatmapMarket, HeatmapResponse } from "@/lib/types/HeatmapType"

export default function HeatmapTopSectorBanner({
  market,
  topSector,
  periodLabel,
  partial,
  isLoading,
  collecting,
}: {
  market: HeatmapMarket
  topSector: HeatmapResponse["top_sector"] | undefined
  periodLabel: string
  partial: boolean
  isLoading: boolean
  collecting: boolean | undefined
}) {
  const rate = topSector?.change_rate
  const negative = rate != null && rate < 0
  const tone =
    rate == null || rate === 0
      ? "text-neutral-600 dark:text-neutral-400"
      : negative
        ? "text-blue-700 dark:text-blue-400"
        : "text-red-700 dark:text-red-400"
  const Direction =
    rate == null || rate === 0
      ? Minus
      : negative
        ? ArrowDownRight
        : ArrowUpRight

  return (
    <section
      aria-label="상승률 1위 섹터"
      className="relative overflow-hidden rounded-xl border border-heatmap-border bg-heatmap-panel shadow-sm"
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-point" />
      <div className="grid gap-5 p-5 sm:px-6 sm:py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-heatmap-soft px-2 py-1 text-heatmap-accent">
              <TrendingUp className="size-3.5" aria-hidden="true" /> 상승률 1위
            </span>
            <span className="text-neutral-500 dark:text-neutral-400">
              {market.toUpperCase()} · {periodLabel}
            </span>
          </div>
          <h2 className="text-base font-semibold tracking-tight text-neutral-800 sm:text-lg dark:text-neutral-200">
            개미가 가장 많이 몰린 단물 섹터는?
          </h2>
          <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            전체 대상 업종의 시가총액 가중 등락률을 비교합니다.
          </p>
        </div>
        {topSector ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-heatmap-border/60 pt-4 lg:min-w-64 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <div>
              <p className="text-xl font-bold tracking-tight text-neutral-900 md:text-2xl dark:text-neutral-100">
                {topSector.name}
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {negative ? "전체 업종 중 하락폭 최소" : "선택 기간 등락률"}
              </p>
            </div>
            <p
              className={`flex items-center gap-1 text-3xl font-bold tracking-tight tabular-nums ${tone}`}
            >
              <Direction className="size-6" aria-hidden="true" />
              {formatChange(rate ?? null)}
            </p>
            {partial && (
              <p className="w-full text-xs text-amber-700">
                일부 종목의 시세를 확인하고 있습니다.
              </p>
            )}
          </div>
        ) : (
          <p
            role="status"
            className="rounded-xl bg-heatmap-canvas px-5 py-4 text-sm text-neutral-500 dark:text-neutral-400"
          >
            {isLoading || collecting
              ? "업종별 상승률을 집계하고 있어요"
              : "집계 데이터 대기 중"}
          </p>
        )}
      </div>
    </section>
  )
}
