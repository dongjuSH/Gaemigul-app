import { heatmapColor } from "@/lib/heatmap-layout"

const RATES = [-5, -2.5, 0, 2.5, 5]

export default function HeatmapLegend() {
  return (
    <div
      className="w-36 shrink-0"
      aria-label="등락률: 파랑은 하락, 회색은 보합 또는 미제공, 빨강은 상승"
    >
      <div className="mb-1 flex justify-between text-[9px] font-medium text-neutral-500 tabular-nums max-md:text-[11px] dark:text-neutral-400">
        <span>−5% 이하</span>
        <span>0%</span>
        <span>+5% 이상</span>
      </div>
      <div className="flex h-1 overflow-hidden rounded-sm" aria-hidden="true">
        {RATES.map((rate) => (
          <span
            key={rate}
            className="flex-1"
            style={{ backgroundColor: heatmapColor(rate) }}
          />
        ))}
      </div>
    </div>
  )
}
