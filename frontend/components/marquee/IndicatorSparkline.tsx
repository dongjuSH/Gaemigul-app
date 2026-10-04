"use client"

import { useId } from "react"
import { Area, AreaChart } from "recharts"

export default function IndicatorSparkline({
  data,
  color,
}: {
  data: { desktop: number }[]
  color: string
}) {
  const gradientId = `indicator-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`

  // The ticker is always 80 × 40. A hidden desktop/mobile header has no
  // measurable parent size, so this chart must not use ResponsiveContainer.
  // Decorative only: ignore pointer/touch so tapping the ticker never interacts with the chart.
  return (
    <div className="pointer-events-none h-10 w-20 shrink-0 **:outline-none" aria-hidden="true">
      <AreaChart
        width={80}
        height={40}
        data={data}
        margin={{ top: 2, bottom: 2, right: 2 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.8} />
            <stop offset="95%" stopColor={color} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Area
          dataKey="desktop"
          type="linear"
          fill={`url(#${gradientId})`}
          fillOpacity={0.4}
          stroke={color}
          stackId="a"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </div>
  )
}
