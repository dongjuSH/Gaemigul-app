"use client"

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui"
import type { BriefingCorrelationChart as BriefingCorrelationChartType } from "@/lib/types/BriefingType"

const chartConfig = {
  fxRate: { label: "원/달러 환율(KRW)", color: "#94a3b8" },
  netSell: { label: "외인 누적 순매도(조원)", color: "#ef4444" },
}

type BriefingCorrelationChartProps = {
  chart: BriefingCorrelationChartType
}

export default function BriefingCorrelationChart({
  chart,
}: BriefingCorrelationChartProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold text-card-foreground">{chart.title}</p>

      <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
        <ComposedChart
          data={chart.data}
          margin={{ left: -20, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            yAxisId="left"
            dataKey="fxRate"
            fill="var(--color-fxRate)"
            radius={[4, 4, 0, 0]}
            barSize={28}
          />
          <Line
            yAxisId="right"
            dataKey="netSell"
            type="monotone"
            stroke="var(--color-netSell)"
            strokeWidth={2.5}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ChartContainer>

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{chart.footnoteLeft}</span>
        <span>{chart.footnoteRight}</span>
      </div>
    </div>
  )
}
