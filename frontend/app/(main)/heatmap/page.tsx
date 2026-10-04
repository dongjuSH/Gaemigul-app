"use client"

import { useState } from "react"
import HeatmapDashboard from "@/components/heatmap/HeatmapDashboard"
import type { HeatmapMarket, HeatmapPeriod } from "@/lib/types/HeatmapType"
import { PageTitle } from "@/components/common"

export default function Page() {
  const [market, setMarket] = useState<HeatmapMarket>("kosdaq")
  const [period, setPeriod] = useState<HeatmapPeriod>("day")

  return (
    <div className="flex w-full flex-col gap-6">
      <PageTitle
        title="섹터별 단물을 한눈에 보는 지도"
        description="시장의 온도를 한눈에. 상승률부터 연관 산업, 최신 뉴스까지 함께 살펴보세요."
      />

      {/* A new filter owns its own request lifecycle and cannot show the old market. */}
      <HeatmapDashboard
        key={`${market}:${period}`}
        market={market}
        period={period}
        onMarketChange={setMarket}
        onPeriodChange={setPeriod}
      />
    </div>
  )
}
