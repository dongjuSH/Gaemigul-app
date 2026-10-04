"use client"

import { useCallback, useEffect, useState } from "react"
import { DollarSign, TrendingDown, TrendingUp } from "lucide-react"
import { format } from "date-fns"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  type ChartConfig,
} from "@/components/ui"
import {
  getExchangeRate,
  type ExchangeRatePeriod,
  type ExchangeRateResponse,
} from "@/lib/api/market"
import { usdKrwRangeLabels, type UsdKrwRange } from "@/lib/constant/home"
import { SEGMENT_LIST, SEGMENT_TRIGGER } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"
import { useIndicatorSchedule } from "@/hooks/use-indicator-schedule"
import DashboardCard from "./DashboardCard"

const chartConfig = {
  value: {
    label: "환율",
    color: "var(--color-decrease)",
  },
} satisfies ChartConfig

const RANGE_ORDER: UsdKrwRange[] = ["day", "week5", "month"]

const RANGE_TO_PERIOD: Record<UsdKrwRange, ExchangeRatePeriod> = {
  day: "today",
  week5: "5d",
  month: "1m",
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function formatAxisLabel(time: number, range: UsdKrwRange) {
  const date = new Date(time)
  if (range === "day") return format(date, "HH:mm")
  if (range === "week5") return format(date, "M/d")
  return format(date, "M월")
}

/** 툴팁은 눈금보다 자세히 - 하루 "HH:mm", 5일 "M/d HH:mm", 월별 "M/d" */
function formatTooltipLabel(time: number, range: UsdKrwRange) {
  const date = new Date(time)
  if (range === "day") return format(date, "HH:mm")
  if (range === "week5") return format(date, "M/d HH:mm")
  return format(date, "M/d")
}

/** x축 눈금 - 실제 시간 축 위에 일정한 간격으로 둔다 (점 순서가 아니라 시각 기준이라 간격이 고르다)
 * - 하루: 정시 기준 1/2/3/4시간 중 눈금이 7개 이하가 되는 가장 촘촘한 간격
 * - 5일: 매일 0시
 * - 월별: 매달 1일 (범위 안에 하나뿐이면 범위 시작점도 눈금으로 둔다) */
function buildAxisTicks(start: number, end: number, range: UsdKrwRange) {
  const ticks: number[] = []
  if (range === "day") {
    const step =
      [1, 2, 3, 4].find((hours) => (end - start) / (hours * HOUR_MS) <= 6) ?? 4
    const first = new Date(start)
    first.setMinutes(0, 0, 0)
    if (first.getTime() < start) first.setHours(first.getHours() + 1)
    first.setHours(Math.ceil(first.getHours() / step) * step)
    for (let t = first.getTime(); t <= end; t += step * HOUR_MS) ticks.push(t)
    return ticks
  }
  if (range === "week5") {
    const first = new Date(start)
    first.setHours(0, 0, 0, 0)
    if (first.getTime() < start) first.setDate(first.getDate() + 1)
    for (let t = first.getTime(); t <= end; t += DAY_MS) ticks.push(t)
    return ticks
  }
  const cursor = new Date(start)
  cursor.setDate(1)
  cursor.setHours(0, 0, 0, 0)
  if (cursor.getTime() < start) cursor.setMonth(cursor.getMonth() + 1)
  while (cursor.getTime() <= end) {
    ticks.push(cursor.getTime())
    cursor.setMonth(cursor.getMonth() + 1)
  }
  if (ticks.length < 2) ticks.unshift(start)
  return ticks
}

export default function UsdKrwTrendCard() {
  const [range, setRange] = useState<UsdKrwRange>("day")
  const [dataByRange, setDataByRange] = useState<
    Partial<Record<UsdKrwRange, ExchangeRateResponse>>
  >({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const fetchRange = useCallback(async (targetRange: UsdKrwRange) => {
    setLoading(true)
    setLoadError(false)
    try {
      const data = await getExchangeRate(RANGE_TO_PERIOD[targetRange])
      setDataByRange((prev) => ({ ...prev, [targetRange]: data }))
    } catch (error) {
      console.error("[getExchangeRate] 실패", error)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRange(range)
  }, [range, fetchRange])

  useIndicatorSchedule(() => fetchRange(range))

  const current = dataByRange[range]
  const points = current?.points ?? []
  // 시간 축에 놓으려고 시각을 숫자(ms)로 바꾼 차트용 데이터
  const chartData = points.map((point) => ({
    time: new Date(point.timestamp).getTime(),
    value: point.value,
  }))
  const values = points.map((point) => point.value)
  const latest = values.at(-1)
  const previous = values.at(-2)
  const change =
    latest !== undefined && previous !== undefined ? latest - previous : 0
  const changeRate =
    latest !== undefined && previous !== undefined && previous !== 0
      ? (change / previous) * 100
      : 0
  const isUp = change >= 0
  const axisTicks =
    chartData.length > 1
      ? buildAxisTicks(chartData[0].time, chartData.at(-1)!.time, range)
      : undefined
  // 위아래 여백을 값 범위의 5%로만 둬서(예전 20%) 작은 등락도 그래프 높이를 꽉 채워 굴곡이 크게 보이게 한다
  const domainPadding =
    values.length > 0
      ? (Math.max(...values) - Math.min(...values)) * 0.05 || 1
      : 1

  return (
    <DashboardCard
      icon={<DollarSign size={16} className="text-point" />}
      title="원/달러 환율 추이"
      className="h-full w-full"
      action={
        <Tabs
          value={range}
          onValueChange={(value) => setRange(value as UsdKrwRange)}
        >
          <TabsList className={SEGMENT_LIST}>
            {RANGE_ORDER.map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                // 카드 헤더 안이라 공통 알약 탭을 한 단계 작게 쓴다
                className={cn(SEGMENT_TRIGGER, "cursor-pointer px-2.5 py-1 text-xs")}
              >
                {usdKrwRangeLabels[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {loading && !current ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : loadError && !current ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          환율 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : points.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          아직 표시할 환율 데이터가 없어요.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {(latest ?? 0).toLocaleString("ko-KR", {
                minimumFractionDigits: 1,
              })}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 text-sm font-semibold ${isUp ? "text-increase" : "text-decrease"}`}
            >
              {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {Math.abs(change).toFixed(1)} ({Math.abs(changeRate).toFixed(2)}
              %)
            </span>
          </p>

          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-32 w-full"
          >
            <AreaChart
              accessibilityLayer={false}
              data={chartData}
              // 양 끝 눈금 라벨이 잘리지 않도록 좌우 여백을 둔다
              margin={{ top: 8, left: 16, right: 16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="fill-usd-krw" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-decrease)"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-decrease)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                ticks={axisTicks}
                interval={0}
                tickFormatter={(value: number) => formatAxisLabel(value, range)}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                hide
                domain={[
                  Math.min(...values) - domainPadding,
                  Math.max(...values) + domainPadding,
                ]}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) =>
                      formatTooltipLabel(
                        Number(payload?.[0]?.payload?.time),
                        range
                      )
                    }
                  />
                }
              />
              <Area
                dataKey="value"
                type="monotone"
                fill="url(#fill-usd-krw)"
                fillOpacity={1}
                stroke="var(--color-decrease)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </DashboardCard>
  )
}
