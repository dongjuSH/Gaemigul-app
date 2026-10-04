import { ArrowDown, GitBranch } from "lucide-react"
import InfoTooltip from "@/components/common/InfoTooltip"
import { formatChange } from "@/lib/heatmap-layout"
import type { HeatmapRelatedSector } from "@/lib/types/HeatmapType"

function changeColor(rate: number | null) {
  return rate === null || rate === 0
    ? "text-neutral-500 dark:text-neutral-400"
    : rate > 0
      ? "text-red-700 dark:text-red-400"
      : "text-blue-700 dark:text-blue-400"
}

export default function HeatmapRecommendation({
  topSectorName,
  relatedSectors,
  isLoading,
}: {
  topSectorName: string | undefined
  relatedSectors: HeatmapRelatedSector[]
  isLoading: boolean
}) {
  return (
    <aside
      aria-labelledby="heatmap-recommendation-title"
      className="min-w-0 overflow-hidden rounded-xl border border-heatmap-border bg-heatmap-panel shadow-sm"
    >
      <div className="border-b border-heatmap-border bg-heatmap-panel p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          <GitBranch className="size-4 max-md:text-point" aria-hidden="true" />{" "}
          섹터 의식주
          {/* 정보 출처 안내는 본문 대신 아이콘 툴팁으로 */}
          <InfoTooltip label="섹터 의식주 안내" anchorBelowOnDesktop>
            <p>
              산업 연결 또는 같은 시장의 흐름을 참고한 정보입니다. 대표 기업은
              업종별 시가총액 상위 2개입니다.
            </p>
          </InfoTooltip>
        </div>
        <h2
          id="heatmap-recommendation-title"
          className="text-lg font-bold tracking-tight text-neutral-900 max-md:text-base dark:text-neutral-100"
        >
          함께 살펴볼 연관 섹터
        </h2>
        <p className="mt-1.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          1위 업종과 연결되는 산업을 따라가 보세요.
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-heatmap-border bg-heatmap-panel px-4 py-3.5 text-neutral-900 max-md:rounded-lg dark:text-neutral-100">
          <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
            출발 섹터
          </span>
          <strong className="text-right text-sm">
            {topSectorName ?? "상승률 집계 중"}
          </strong>
        </div>
        <div className="flex justify-center py-2 text-neutral-300 dark:text-neutral-600">
          <ArrowDown className="size-4" aria-hidden="true" />
        </div>
        {relatedSectors.length ? (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            {relatedSectors.slice(0, 3).map((sector, index) => (
              <article
                key={sector.code}
                className="rounded-xl border border-heatmap-border bg-heatmap-panel p-3.5 max-md:rounded-lg max-md:p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="flex min-w-0 items-start gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    <span className="pt-0.5 text-[11px] font-medium text-neutral-400 tabular-nums max-md:text-xs dark:text-neutral-500">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {sector.name}
                  </h3>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${changeColor(sector.change_rate)}`}
                  >
                    {formatChange(sector.change_rate)}
                  </span>
                </div>
                <span className="mt-2.5 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 max-md:rounded-full max-md:px-2 max-md:text-xs dark:bg-neutral-800 dark:text-neutral-400">
                  {sector.relationship_kind === "market_trend"
                    ? "같은 시장의 흐름"
                    : "산업 연결"}
                </span>
                <p className="mt-1.5 text-xs leading-5 text-neutral-600 dark:text-neutral-400">
                  {sector.reason}
                </p>
                <ul
                  className="mt-3 divide-y divide-neutral-100 border-t border-heatmap-border/60 dark:divide-neutral-700"
                  aria-label={`${sector.name} 대표 기업`}
                >
                  {sector.stocks.slice(0, 2).map((stock) => (
                    <li
                      key={stock.code}
                      className="flex items-center justify-between gap-2 pt-2.5 pb-1"
                    >
                      <div className="min-w-0">
                        <p
                          className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                          title={stock.name}
                        >
                          {stock.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-neutral-500 tabular-nums max-md:text-[11px] dark:text-neutral-400">
                          {stock.code}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-medium tabular-nums ${changeColor(stock.change_rate)}`}
                      >
                        {stock.change_rate === null
                          ? "—"
                          : formatChange(stock.change_rate)}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p
            role="status"
            className="rounded-xl bg-heatmap-panel px-4 py-6 text-sm leading-6 text-neutral-500 dark:text-neutral-400"
          >
            {isLoading
              ? "연관 업종과 대표 기업을 확인하고 있어요."
              : "현재 데이터에서 확인할 수 있는 연관 업종이 없습니다."}
          </p>
        )}
      </div>
    </aside>
  )
}
