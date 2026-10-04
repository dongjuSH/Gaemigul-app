import { Skeleton } from "@/components/ui"
import { SECTION_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

/** 카드 배경 위에서도 잘 보이도록 기본 Skeleton보다 대비를 높인 바 */
function Bar({ className }: { className?: string }) {
  return <Skeleton className={cn("bg-muted-foreground/15", className)} />
}

/** WeekList가 아직 데이터를 못 받아왔을 때 보여줄, 같은 표 레이아웃의 스켈레톤 */
export function WeekListSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((week) => (
        <div key={week}>
          <Bar className="mb-2 h-4 w-20" />
          <div className="overflow-hidden rounded-lg border">
            <div className="flex items-center gap-4 border-b bg-muted/40 p-2">
              <Bar className="h-3 w-10" />
              <Bar className="h-3 flex-1" />
              <Bar className="h-3 w-16" />
              <Bar className="h-3 w-10" />
              <Bar className="h-3 w-10" />
            </div>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex items-center gap-4 border-b p-2 last:border-b-0"
              >
                <Bar className="h-3 w-10 shrink-0" />
                <Bar className="h-3 flex-1" />
                <Bar className="h-3 w-16 shrink-0" />
                <Bar className="h-3 w-10 shrink-0" />
                <Bar className="h-3 w-10 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** MonthGrid가 아직 데이터를 못 받아왔을 때 보여줄, 같은 6열 달력 레이아웃의 스켈레톤 */
export function MonthGridSkeleton() {
  return (
    <div className="flex min-w-175 flex-col">
      <div className="grid grid-cols-6 border-b pb-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex justify-center">
            <Bar className="h-4 w-6" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-px overflow-hidden bg-border">
        {Array.from({ length: 30 }, (_, i) => (
          <div
            key={i}
            className="flex min-h-24 flex-col gap-1.5 bg-card p-1.5 sm:min-h-28"
          >
            <Bar className="h-3 w-4" />
            <Bar className="h-2.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** WeekPlan 카드가 아직 데이터를 못 받아왔을 때 보여줄 스켈레톤 */
export function WeekPlanSkeleton() {
  return (
    <div className={SECTION_CARD}>
      <Bar className="mb-2 h-3.5 w-32" />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <Bar className="h-3 w-3/4" />
            <Bar className="ml-3 h-2.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** BeginnerLessonTeaser 카드가 아직 데이터를 못 받아왔을 때 보여줄 스켈레톤 */
export function BeginnerLessonTeaserSkeleton() {
  return (
    <div className={SECTION_CARD}>
      <Bar className="mb-2 h-3.5 w-28" />
      <Bar className="h-3 w-full" />
      <Bar className="mt-1.5 h-2.5 w-2/3" />
      <div className="mt-2 flex gap-1">
        <Bar className="h-4 w-12 rounded-full" />
        <Bar className="h-4 w-14 rounded-full" />
      </div>
      <Bar className="mt-3 h-7 w-28 rounded-full" />
    </div>
  )
}
