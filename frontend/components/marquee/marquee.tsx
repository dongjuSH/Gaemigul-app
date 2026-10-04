"use client"

import { Card, CardContent, Skeleton } from "@/components/ui"
import IndicatorSparkline from "./IndicatorSparkline"

import { Marquee } from "@/components/animations/marquee"

import type { MarketIndicatorItem } from "@/lib/api/indicator"

import {
  uptrendChartData,
  downtrendChartData,
  flatChartData,
} from "@/lib/constant/indicatorChartData"

const IndexDataCard = ({ name, price, change_rate }: MarketIndicatorItem) => {
  const direction: "up" | "down" | "flat" =
    change_rate > 0 ? "up" : change_rate < 0 ? "down" : "flat"
  const value = price.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const change = `${change_rate > 0 ? "+" : ""}${change_rate.toFixed(2)}%`
  const chartColor = {
    up: "var(--color-increase)",
    down: "var(--color-decrease)",
    flat: "var(--muted-foreground)",
  }[direction]
  const changeTextClass = {
    up: "text-increase",
    down: "text-decrease",
    flat: "text-neutral-500 dark:text-neutral-400",
  }[direction]
  const chartData = {
    up: uptrendChartData,
    down: downtrendChartData,
    flat: flatChartData,
  }[direction]
  return (
    <Card className="h-full rounded-lg border-border bg-card px-3.5 py-2.25 shadow-none">
      <CardContent className="flex min-w-42 gap-3 px-0">
        <div>
          <p className="flex items-center gap-1.25 text-[12px] font-medium text-neutral-600 dark:text-neutral-300">
            {name}
            <span className={`text-[12px] ${changeTextClass}`}>{change}</span>
          </p>
          <strong className="text-base font-semibold">{value}</strong>
        </div>
        <IndicatorSparkline data={chartData} color={chartColor} />
      </CardContent>
    </Card>
  )
}

const IndexDataCardSkeleton = () => (
  <Card className="h-full rounded-lg border-border bg-card px-3.5 py-2.25 shadow-none">
    <CardContent className="flex min-w-42 gap-3 px-0">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-10 w-20" />
    </CardContent>
  </Card>
)

const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"]

/** 지수 티커 - 표시만 담당한다. 헤더에 데스크톱/모바일용으로 두 번 그려지므로 데이터는
 * 여기서 불러오지 않고 Header가 한 번만 불러와 내려준다(인스턴스마다 요청·타이머가 중복되지 않게) */
export default function TestimonialMarqueeDemo({
  items,
}: {
  items: MarketIndicatorItem[]
}) {
  const isLoading = items.length === 0

  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center overflow-hidden">
      <Marquee pauseOnHover className="[--duration:30s]">
        {isLoading
          ? SKELETON_KEYS.map((key) => <IndexDataCardSkeleton key={key} />)
          : items.map((item) => <IndexDataCard key={item.code} {...item} />)}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-background"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-background"></div>
    </div>
  )
}
