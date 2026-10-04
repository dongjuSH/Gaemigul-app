"use client"

import { useCallback, useEffect, useState } from "react"
import { BarChart3 } from "lucide-react"
import { format } from "date-fns"
import { ko } from "date-fns/locale/ko"
import { Bar, BarChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Skeleton,
  type ChartConfig,
} from "@/components/ui"
import {
  getInvestorFlow,
  getTradingValueDistribution,
  type InvestorFlowResponse,
  type TradingValueDistributionResponse,
} from "@/lib/api/market"
import { useIndicatorSchedule } from "@/hooks/use-indicator-schedule"
import DashboardCard from "./DashboardCard"

const volumeChartConfig = {
  amount: {
    label: "거래대금",
    color: "var(--color-point)",
  },
} satisfies ChartConfig

const MIN_FLOW_BAR_WIDTH = 20
const MAX_FLOW_BAR_WIDTH = 100

interface InvestorFlowChartItem {
  investor: string
  value: number
}

function toInvestorFlowChartItems(
  flow: InvestorFlowResponse
): InvestorFlowChartItem[] {
  // KIS 원본 단위(백만원) → 화면 표기 단위(억 원)
  const toEok = (amount: number) => Math.round(amount / 100)
  return [
    { investor: "개인", value: toEok(flow.individual) },
    { investor: "외국인", value: toEok(flow.foreign) },
    { investor: "기관", value: toEok(flow.institution) },
  ]
}

export default function TradingActivityCard() {
  const [tradingValue, setTradingValue] =
    useState<TradingValueDistributionResponse | null>(null)
  const [investorFlow, setInvestorFlow] = useState<InvestorFlowResponse | null>(
    null
  )
  const [loadError, setLoadError] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [tradingValueData, investorFlowData] = await Promise.all([
        getTradingValueDistribution(),
        getInvestorFlow(),
      ])
      setTradingValue(tradingValueData)
      setInvestorFlow(investorFlowData)
      setLoadError(false)
    } catch (error) {
      console.error("[TradingActivityCard] 데이터 로드 실패", error)
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useIndicatorSchedule(fetchData)

  const basisDateLabel = tradingValue
    ? format(new Date(tradingValue.market_date), "M월d일(EEE)", {
        locale: ko,
      })
    : ""
  const basisLabel = tradingValue
    ? `${format(new Date(tradingValue.market_date), "M월d일", { locale: ko })} 15:30 장마감 기준`
    : ""

  const tradingValuePoints =
    tradingValue?.points.map((point) => ({
      time: point.time_slot,
      amount: Math.round(point.amount / 100),
    })) ?? []

  const investorFlowItems = investorFlow
    ? toInvestorFlowChartItems(investorFlow)
    : []
  const maxFlowValue = Math.max(
    1,
    ...investorFlowItems.map((flow) => Math.abs(flow.value))
  )

  const isLoading = !tradingValue && !investorFlow && !loadError
  const isEmpty =
    !loadError &&
    ((tradingValue !== null && tradingValuePoints.length === 0) ||
      (investorFlow !== null && investorFlowItems.length === 0))

  return (
    <DashboardCard
      icon={<BarChart3 size={16} className="text-point" />}
      title={
        <>
          시간대별 거래대금 분포
          {basisDateLabel && (
            <span className="text-[11px] font-normal text-neutral-400">
              {basisDateLabel}
            </span>
          )}
        </>
      }
      action={
        tradingValue && (
          <span className="text-[11px] text-neutral-400">단위: 억 원</span>
        )
      }
    >
      {loadError && !tradingValue && !investorFlow ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          거래 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6 dark:border-neutral-800">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      ) : isEmpty ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          아직 표시할 거래 데이터가 없어요.
        </p>
      ) : (
        // 거래대금 분포 | 투자자별 매매동향을 PC에서는 5:5 가로로, 모바일에서는 세로로 쌓는다
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ChartContainer
            config={volumeChartConfig}
            className="aspect-auto h-32 w-full"
          >
            <BarChart
              accessibilityLayer={false}
              data={tradingValuePoints}
              margin={{ top: 4, left: 0, right: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                interval={2}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis hide />
              <ChartTooltip
                cursor={{ fill: "var(--color-muted)" }}
                content={<ChartTooltipContent />}
              />
              <Bar
                dataKey="amount"
                fill="var(--color-point)"
                radius={[4, 4, 0, 0]}
                opacity={0.85}
              />
            </BarChart>
          </ChartContainer>

          <div className="flex min-w-0 flex-col gap-2 border-t border-neutral-100 pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-foreground">투자자별 매매동향</h4>
              <span className="text-[11px] text-neutral-400">
                {basisLabel}
              </span>
            </div>
            <div className="flex flex-col gap-2.5 py-1">
              {investorFlowItems.map((item) => {
                const isPositive = item.value >= 0
                const color = isPositive
                  ? "var(--color-increase)"
                  : "var(--color-decrease)"
                // min-width를 바닥값으로 두면 값이 다른데도 같은 길이로 보이므로,
                // [0, maxFlowValue] 비율을 [최소, 최대] 폭 구간으로 매핑해 크기 차이를 유지한다.
                const barWidth =
                  MIN_FLOW_BAR_WIDTH +
                  (Math.abs(item.value) / maxFlowValue) *
                    (MAX_FLOW_BAR_WIDTH - MIN_FLOW_BAR_WIDTH)
                const valueLabel = `${isPositive ? "+" : ""}${item.value.toLocaleString()}억 원`
                return (
                  <div
                    key={item.investor}
                    className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2"
                  >
                    <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 md:w-11 md:shrink-0">
                      {item.investor}
                    </span>
                    <div className="flex min-w-0 w-full items-center md:flex-1">
                      <div className="flex min-w-0 w-1/2 items-center justify-end gap-1.5">
                        {!isPositive && (
                          <>
                            <span
                              className="shrink-0 text-xs font-semibold whitespace-nowrap"
                              style={{ color }}
                            >
                              {valueLabel}
                            </span>
                            <span
                              className="h-4 min-w-5 shrink rounded-l-sm transition-all duration-300"
                              style={{ width: barWidth, backgroundColor: color }}
                            />
                          </>
                        )}
                      </div>
                      <span className="h-5 w-px shrink-0 bg-neutral-300" />
                      <div className="flex min-w-0 w-1/2 items-center justify-start gap-1.5">
                        {isPositive && (
                          <>
                            <span
                              className="h-4 min-w-5 shrink rounded-r-sm transition-all duration-300"
                              style={{ width: barWidth, backgroundColor: color }}
                            />
                            <span
                              className="shrink-0 text-xs font-semibold whitespace-nowrap"
                              style={{ color }}
                            >
                              {valueLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  )
}
