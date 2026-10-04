import { Skeleton } from "@/components/ui"
import { SECTION_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

/** 시황 섹션 하나의 뼈대 - 섹션 제목 + 카드(지표 줄 / 요약 3칸 / 주린이 해설 3칸 / 뉴스 줄) */
function TimelineSectionSkeleton() {
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-baseline gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-12" />
      </div>
      <div className={cn(SECTION_CARD, "flex w-full flex-col gap-10")}>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 min-w-28 flex-1" />
          ))}
        </div>
        {Array.from({ length: 2 }, (_, group) => (
          <div key={group} className="flex flex-col gap-3">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-36 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 시황 타임라인을 불러오는 동안 보여주는 스켈레톤 */
export default function TimelineSkeleton() {
  return (
    <div
      role="status"
      aria-label="타임라인을 불러오는 중"
      className="flex w-full flex-col gap-15"
    >
      <TimelineSectionSkeleton />
      <TimelineSectionSkeleton />
      <span className="sr-only">타임라인을 불러오는 중이에요.</span>
    </div>
  )
}
