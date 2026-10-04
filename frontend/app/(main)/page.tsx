import PheromoneTemperatureCard from "@/components/home/PheromoneTemperatureCard"
import TodayAntTermCard from "@/components/home/TodayAntTermCard"
import CalendarScheduleCard from "@/components/home/dashboard/CalendarScheduleCard"
import PheromoneSignalCard from "@/components/home/dashboard/PheromoneSignalCard"
import TradingActivityCard from "@/components/home/dashboard/TradingActivityCard"
import UsdKrwTrendCard from "@/components/home/dashboard/UsdKrwTrendCard"

export default function Page() {
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-6">
        <PheromoneTemperatureCard />

        {/* 상단 3영역: 원/달러 환율 : 소란지수 : 오늘의 한 입 = 2:1:1 (데스크톱).
            태블릿은 환율을 한 줄로, 나머지 둘을 아래에 나란히 두고 모바일은 세로로 쌓는다 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 md:col-span-2">
            <UsdKrwTrendCard />
          </div>
          <div className="flex min-w-0">
            <PheromoneSignalCard />
          </div>
          <div className="flex min-w-0">
            <TodayAntTermCard />
          </div>
        </div>

        <TradingActivityCard />
        <CalendarScheduleCard />
      </div>
    </div>
  )
}
