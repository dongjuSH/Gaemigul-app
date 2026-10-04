"use client"

import { Newspaper } from "lucide-react"
import { useHeatmapNews } from "@/hooks/use-heatmap-news"
import type {
  HeatmapMarket,
  HeatmapPeriod,
  HeatmapResponse,
} from "@/lib/types/HeatmapType"

export default function HeatmapNewsSection({
  market,
  period,
  snapshot,
}: {
  market: HeatmapMarket
  period: HeatmapPeriod
  snapshot: HeatmapResponse | null
}) {
  const { data, error, isLoading } = useHeatmapNews(market, period, snapshot)
  const topSectorName = snapshot?.top_sector?.name
  const items = data?.items ?? []
  return (
    <section
      aria-labelledby="heatmap-news-title"
      className="rounded-xl border border-heatmap-border bg-heatmap-panel p-4 shadow-sm sm:p-5"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-heatmap-border pb-4 max-md:mb-4 max-md:pb-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <Newspaper
              className="size-4 max-md:text-point"
              aria-hidden="true"
            />{" "}
            관련 경제뉴스
          </div>
          <h2
            id="heatmap-news-title"
            className="text-lg font-bold tracking-tight text-neutral-900 max-md:text-base dark:text-neutral-100"
          >
            상승률 1위 섹터 뉴스
          </h2>
        </div>
        {topSectorName && (
          <span className="rounded-full border border-heatmap-border bg-heatmap-canvas px-3 py-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            {topSectorName}
          </span>
        )}
      </div>
      {data?.is_stale && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"
        >
          최신 뉴스 연결을 확인 중입니다. 이전에 수집한 기사를 표시합니다.
        </p>
      )}
      {items.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <a
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${item.title} (새 탭)`}
              className="flex min-w-0 flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-shadow duration-200 hover:shadow-md"
            >
              <p className="line-clamp-2 text-xs leading-relaxed text-card-foreground">
                {item.title}
              </p>
              <span className="truncate text-[11px] font-medium text-neutral-400">
                {item.source || "언론사 미제공"}
              </span>
            </a>
          ))}
        </div>
      ) : isLoading ? (
        <div
          role="status"
          aria-label="관련 뉴스 불러오는 중"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="min-h-48 rounded-xl border border-heatmap-border p-4 motion-safe:animate-pulse"
            >
              <div className="h-3 w-1/3 rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="mt-6 h-4 w-full rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="mt-3 h-4 w-5/6 rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="mt-7 h-3 w-1/2 rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
          ))}
          <span className="sr-only">관련 뉴스를 불러오고 있어요.</span>
        </div>
      ) : (
        <div
          role="status"
          className="flex min-h-40 items-center justify-center gap-3 rounded-xl bg-heatmap-canvas px-5 py-8 text-sm leading-6 text-neutral-500 dark:text-neutral-400"
        >
          <Newspaper className="size-5 shrink-0" aria-hidden="true" />
          <p>
            {error ??
              data?.message ??
              (topSectorName
                ? "확인할 수 있는 최신 관련 기사가 없습니다."
                : "상승률 1위 업종이 집계되면 최신 뉴스를 보여드려요.")}
          </p>
        </div>
      )}
      {items.length > 0 && data?.message && !data.is_stale && (
        <p
          role="status"
          className="mt-1 text-xs text-neutral-500 dark:text-neutral-400"
        >
          {data.message}
        </p>
      )}
    </section>
  )
}
