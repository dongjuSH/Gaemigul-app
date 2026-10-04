"use client"

import { formatClock } from "@/lib/utils"

import { useTimelineSchedule } from "./use-timeline-schedule"

/**
 * "현재 시간 / 다음 일정 / 남은 시간" 시계. 매초 갱신되므로 이 부분만 따로 리렌더링되게 분리했다
 * (사이드바 전체와 그 안의 타임라인 목록이 매초 다시 그려지지 않도록). 감싸는 레이아웃은 쓰는 쪽에서 정한다.
 * - desktop: 데스크톱 사이드바 타임라인 위 - 큰 시계(32px) + 오른쪽에 다음 일정·남은 시간
 * - mobile: 모바일 햄버거 메뉴 상단 - "현재 시간" 라벨 + 시계(24px) / 오른쪽에 "다음 일정 | 제목"·남은 시간
 */
export default function ScheduleClock({
  variant,
}: {
  variant: "desktop" | "mobile"
}) {
  const { now, nextItem, remainingLabel } = useTimelineSchedule(1000)
  const time = now ? formatClock(now) : "--:--:--"

  if (variant === "mobile") {
    return (
      <>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] text-muted-foreground">현재 시간</span>
          <strong className="text-[24px] leading-6 font-semibold tracking-[1px] text-foreground">
            {time}
          </strong>
        </div>
        <div className="text-right text-[12px] text-muted-foreground">
          <p className="flex items-center gap-0.5 pt-0.75 text-foreground">
            <span>다음 일정 |</span>
            {nextItem ? nextItem.title : "-"}
          </p>
          <p className="font-semibold text-point">{remainingLabel ?? ""}</p>
        </div>
      </>
    )
  }

  return (
    <div className="text-right text-[12px] text-muted-foreground">
      <div className="flex gap-0.5">
        <div className="flex w-full items-center justify-between">
          <strong className="text-[32px] leading-6 font-bold tracking-[1px] text-foreground">
            {time}
          </strong>

          <div className="mt-px flex flex-col gap-px">
            <div className="flex items-center justify-end">
              <p className="text-[10px] text-foreground">
                {nextItem ? nextItem.title : "-"}
              </p>
            </div>
            <p className="-mt-1 font-semibold text-point">
              {remainingLabel ?? "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
