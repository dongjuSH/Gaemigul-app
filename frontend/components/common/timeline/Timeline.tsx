"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { cn } from "cn"

import { Badge } from "../../ui"
import type { TimelineStatus } from "@/lib/types/TimelineType"
import { useTimelineSchedule } from "./use-timeline-schedule"

const TIMELINE_PAGE_PATH = "/timeline"

const dotClassName: Record<TimelineStatus, string> = {
  past: "bg-neutral-300",
  current: "bg-point",
  next: "bg-decrease",
  upcoming: "bg-neutral-300",
}

const badgeClassName: Record<TimelineStatus, string> = {
  past: "bg-neutral-500 text-white",
  current: "bg-point text-white",
  next: "bg-decrease text-white",
  upcoming: "",
}

const mutedStatuses = new Set<TimelineStatus>(["past", "upcoming"])

export default function Timeline() {
  const router = useRouter()
  const pathname = usePathname()
  const { items } = useTimelineSchedule(30000)
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const autoScrolledRef = useRef(false)

  // 지금 진행 중인 시황(없으면 다음 시황) - 페이지 로드 시 사이드바 목록을 여기로 스크롤한다
  const activeId =
    items.find((item) => item.status === "current")?.id ??
    items.find((item) => item.status === "next")?.id

  // 처음 한 번만 자동 스크롤한다(이후엔 사용자가 직접 스크롤한 위치를 존중).
  // 시계는 마운트 직후 한 틱 뒤에 잡혀서 그때 activeId가 정해진다.
  // scrollIntoView는 페이지 전체까지 움직일 수 있어서 목록 컨테이너의 scrollTop만 조정한다
  useEffect(() => {
    if (autoScrolledRef.current || !activeId) return
    const container = scrollRef.current
    const target = itemRefs.current[activeId]
    // 모바일처럼 타임라인이 숨겨져(display:none) 있으면 크기가 0이라 스크롤하지 않는다
    if (!container || !target || container.clientHeight === 0) return

    autoScrolledRef.current = true
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop
    // 로드 직후(첫 페인트 전)에 시작한 smooth 스크롤은 취소돼 버려서 즉시 이동한다
    container.scrollTo({ top: Math.max(0, top - 12) })
  }, [activeId])

  const goToSection = (
    id: string,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    // 사이드바 내부 스크롤에서 클릭한 버튼이 상단에 오도록 앵커링한다.
    event.currentTarget.scrollIntoView({ behavior: "smooth", block: "start" })

    if (pathname === TIMELINE_PAGE_PATH) {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      return
    }

    router.push(`${TIMELINE_PAGE_PATH}#${id}`)
  }

  return (
    // 사이드바 하단에 떠 있는 TIP 높이(--sidebar-tip-height, Sidebar가 설정)만큼 아래 여백을 둬서
    // 마지막 항목까지 스크롤로 TIP 위에 올릴 수 있게 한다. TIP을 닫으면 0
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto pb-(--sidebar-tip-height)"
    >
      <ol className="relative flex flex-col px-5 py-3">
        <span className="absolute top-5.5 bottom-5.5 left-6.75 w-0.5 bg-neutral-200" />
        {items.map((item) => {
          const isMuted = mutedStatuses.has(item.status)

          return (
            <li
              key={item.id}
              ref={(node) => {
                itemRefs.current[item.id] = node
              }}
              className="pb-5 last:pb-0"
            >
              <button
                type="button"
                onClick={(event) => goToSection(item.id, event)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 rounded-lg py-1 text-left transition-colors duration-200",
                  item.status !== "current" && "hover:bg-muted dark:hover:bg-neutral-800"
                )}
              >
                <div className="flex h-5 w-4 shrink-0 items-center justify-center">
                  {item.status === "current" ? (
                    <span className="relative flex size-3.5 items-center justify-center">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-point opacity-75" />
                      <span className="relative z-10 size-2.5 rounded-full bg-point ring-2 ring-white" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "z-10 size-2 rounded-full transition-colors duration-200",
                        dotClassName[item.status]
                      )}
                    />
                  )}
                </div>
                <div
                  className={cn(
                    "flex-1 rounded-lg",
                    item.status === "current" &&
                      "border border-point bg-card px-3 py-2"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-[12px] font-medium transition-colors duration-200",
                        isMuted ? "text-neutral-400" : "text-muted-foreground"
                      )}
                    >
                      {item.time}
                    </span>
                    {item.status !== "upcoming" && (
                      <Badge
                        className={cn(
                          "text-[10px] transition-colors duration-200",
                          badgeClassName[item.status]
                        )}
                      >
                        {item.badgeLabel}
                      </Badge>
                    )}
                  </div>
                  <strong
                    className={cn(
                      "mt-1 block text-[14px] font-semibold transition-colors duration-200",
                      isMuted ? "text-neutral-400" : "text-foreground"
                    )}
                  >
                    {item.title}
                  </strong>
                  <p
                    className={cn(
                      "mt-0.5 text-[12px] transition-colors duration-200",
                      isMuted ? "text-neutral-400" : "text-muted-foreground"
                    )}
                  >
                    {item.description}
                  </p>
                </div>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
