import {
  AlertCircle,
  ChartNoAxesCombined,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { HeatmapResponse } from "@/lib/types/HeatmapType"

export default function HeatmapEmptyState({
  error,
  collecting,
  message,
  coverage,
  manualRefreshDisabled,
  refreshWaitSeconds,
  onRefresh,
}: {
  error: string | null
  collecting: boolean | undefined
  message: string | null | undefined
  coverage: HeatmapResponse["coverage"] | undefined
  manualRefreshDisabled: boolean
  refreshWaitSeconds: number
  onRefresh: () => void
}) {
  return (
    <div className="flex min-h-[530px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/70 px-6 text-center dark:border-neutral-700 dark:bg-neutral-800/40">
      <div
        className={`mb-4 flex size-14 items-center justify-center rounded-xl ${error ? "bg-amber-50 text-amber-600" : "bg-red-50 text-point"}`}
      >
        {error ? (
          <AlertCircle className="size-6" />
        ) : collecting ? (
          <LoaderCircle className="size-6 animate-spin" />
        ) : (
          <ChartNoAxesCombined className="size-6" />
        )}
      </div>
      <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-100">
        {error
          ? "히트맵을 불러오지 못했어요"
          : collecting
            ? "시장의 온도를 모으고 있어요"
            : "아직 표시할 데이터가 없어요"}
      </h2>
      <p className="mt-2 max-w-80 text-xs leading-6 text-neutral-500 dark:text-neutral-400">
        {error
          ? "연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요."
          : collecting
            ? "첫 수집에는 몇 분이 걸릴 수 있습니다. 수집이 완료되면 히트맵과 상승률 1위 업종이 자동으로 표시됩니다."
            : message ||
              "시세가 준비되면 이곳에서 업종별 흐름을 확인할 수 있습니다."}
      </p>
      {coverage && coverage.total_stocks > 0 && (
        <div className="mt-5 w-full max-w-60">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
            role="progressbar"
            aria-label="시세 수집 진행률"
            aria-valuemin={0}
            aria-valuemax={coverage.total_stocks}
            aria-valuenow={coverage.priced_stocks}
          >
            <div
              className="h-full rounded-full bg-point transition-all"
              style={{
                width: `${Math.min(100, (coverage.priced_stocks / coverage.total_stocks) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-2 text-[10px] text-neutral-400">
            {coverage.priced_stocks.toLocaleString("ko-KR")} /{" "}
            {coverage.total_stocks.toLocaleString("ko-KR")}개 종목
          </p>
        </div>
      )}
      {error && (
        <Button
          variant="outline"
          size="sm"
          className="mt-5"
          onClick={onRefresh}
          disabled={manualRefreshDisabled}
          title="수동 업데이트는 1분에 한 번 가능합니다."
        >
          <RefreshCw />
          {refreshWaitSeconds > 0
            ? `${refreshWaitSeconds}초 후 다시 불러오기`
            : "다시 불러오기"}
        </Button>
      )}
    </div>
  )
}
