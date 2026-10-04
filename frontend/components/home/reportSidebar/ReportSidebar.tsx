"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react"
import { cn } from "cn"

import { Badge, Separator, Skeleton } from "@/components/ui"
import { getReportList } from "@/lib/api/report"
import { mapWeeksToSections } from "@/lib/report-list-mapper"
import type { ReportWeekSection } from "@/lib/types/ReportType"

const TIMELINE_PAGE_PATH = "/timeline"
const BRIEFING_PAGE_PATH = "/briefing"

// 백엔드가 실데이터를 쌓기 시작한 달. 이전 달로는 넘어갈 수 없다.
const MIN_YEAR_MONTH = { year: 2026, month: 9 }

function getCurrentYearMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function shiftMonth(yearMonth: { year: number; month: number }, delta: number) {
  const total = yearMonth.year * 12 + (yearMonth.month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

function compareYearMonth(
  a: { year: number; month: number },
  b: { year: number; month: number }
) {
  return a.year * 12 + a.month - (b.year * 12 + b.month)
}

/** 데스크톱 사이드바·모바일 상단 바가 함께 쓰는 월별 리포트 목록 조회 상태. */
function useReportSidebarState() {
  const MAX_YEAR_MONTH = useMemo(() => getCurrentYearMonth(), [])
  const [yearMonth, setYearMonth] = useState(MAX_YEAR_MONTH)
  const [weeks, setWeeks] = useState<ReportWeekSection[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = () => {
      setIsLoading(true)

      getReportList(yearMonth.year, yearMonth.month)
        .then((data) => {
          if (cancelled) return
          const sections = mapWeeksToSections(data.weeks)
          setWeeks(sections)
          setOpenGroupId(sections[0]?.id ?? null)
        })
        .catch(() => {
          if (cancelled) return
          setWeeks([])
          setOpenGroupId(null)
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    }

    load()

    return () => {
      cancelled = true
    }
  }, [yearMonth])

  return {
    MAX_YEAR_MONTH,
    yearMonth,
    setYearMonth,
    weeks,
    isLoading,
    openGroupId,
    setOpenGroupId,
  }
}

/**
 * 브리핑 페이지 전용 모바일 상단 바. 타임라인 페이지에는 나타나면 안 되고, 브리핑 페이지의
 * main 콘텐츠 안에서 직접 렌더링해야 해서(요청사항) 전역 레이아웃이 아니라 브리핑 페이지
 * 컴포넌트에서 직접 마운트한다.
 */
function ReportSidebarMobileNavContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    MAX_YEAR_MONTH,
    yearMonth,
    setYearMonth,
    weeks,
    isLoading,
    openGroupId,
    setOpenGroupId,
  } = useReportSidebarState()

  const activeType = searchParams.get("type")
  const activeDate = searchParams.get("date")

  return (
    <nav
      className="sticky z-20 flex flex-col gap-2 border-b border-neutral-100 bg-background/95 py-3 backdrop-blur-sm md:hidden md:px-4"
      style={{ top: "var(--header-height, 75px)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <strong className="text-[18px] font-bold">
            {String(yearMonth.month).padStart(2, "0")}월
          </strong>
          <span className="text-[11px] font-medium text-neutral-400">
            {yearMonth.year}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="이전 달"
            disabled={compareYearMonth(yearMonth, MIN_YEAR_MONTH) <= 0}
            onClick={() => setYearMonth((current) => shiftMonth(current, -1))}
            className="cursor-pointer rounded-md p-1 text-neutral-400 transition-colors duration-200 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size="16" />
          </button>
          <button
            type="button"
            aria-label="다음 달"
            disabled={compareYearMonth(yearMonth, MAX_YEAR_MONTH) >= 0}
            onClick={() => setYearMonth((current) => shiftMonth(current, 1))}
            className="cursor-pointer rounded-md p-1 text-neutral-400 transition-colors duration-200 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size="16" />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
          <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
        </div>
      )}

      {!isLoading && weeks && weeks.length === 0 && (
        <p className="py-2 text-center text-[12px] text-neutral-400">
          아직 리포트가 생성되지 않았습니다.
        </p>
      )}

      {!isLoading && weeks && weeks.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {weeks.map((group) => {
              const isOpen = openGroupId === group.id
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() =>
                    setOpenGroupId((current) =>
                      current === group.id ? null : group.id
                    )
                  }
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-0.5 text-[10px] whitespace-nowrap transition-colors duration-200 md:py-1.5 md:text-[12px]",
                    isOpen
                      ? "border-point bg-point/10 font-semibold text-point"
                      : "border-neutral-200 text-neutral-500"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isOpen ? "bg-point" : "bg-neutral-300"
                    )}
                  />
                  {group.rangeLabel}
                </button>
              )
            })}
          </div>

          {weeks
            .filter((group) => group.id === openGroupId)
            .map((group) => (
              <div
                key={group.id}
                className="flex gap-2 overflow-x-auto py-2 md:py-0"
              >
                {group.items.map((item) => {
                  const isActive =
                    activeType === item.type && activeDate === item.date

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        router.push(
                          `${BRIEFING_PAGE_PATH}?type=${item.type}&date=${item.date}`
                        )
                      }
                      className={cn(
                        "relative flex w-36 shrink-0 items-start gap-2 rounded-xl border bg-card px-2 py-2 text-left shadow-sm transition-colors duration-200",
                        isActive
                          ? "border-point shadow-point/40"
                          : "border-border"
                      )}
                    >
                      <Badge
                        className={cn(
                          "absolute -top-2 right-2 text-[9px] transition-colors duration-200",
                          isActive
                            ? "bg-point text-white"
                            : "border border-neutral-200 bg-white text-neutral-400"
                        )}
                      >
                        {item.badgeLabel}
                      </Badge>
                      <div
                        className={cn(
                          "flex w-8 shrink-0 flex-col items-center justify-center rounded-lg py-1 text-[9px] font-medium transition-colors duration-200",
                          isActive
                            ? "bg-point text-white"
                            : "bg-neutral-100 text-neutral-500"
                        )}
                      >
                        <span className="opacity-80">{item.month}</span>
                        <strong className="text-[15px] leading-4 font-bold">
                          {item.dateLabel}
                        </strong>
                        <span className="opacity-80">{item.unitLabel}</span>
                      </div>
                      <p className="line-clamp-2 min-w-0 flex-1 text-[11px] font-semibold text-card-foreground">
                        {item.title}
                      </p>
                    </button>
                  )
                })}
              </div>
            ))}
        </>
      )}
    </nav>
  )
}

/** 브리핑 페이지의 main 콘텐츠 안에서 직접 마운트하는 모바일 전용 상단 바. */
export function ReportSidebarMobileNav() {
  return (
    <Suspense fallback={null}>
      <ReportSidebarMobileNavContent />
    </Suspense>
  )
}

type ReportSidebarToggleProps = {
  /** 펼침 여부 - 본문 폭과 함께 바뀌어야 해서 (main)/layout.tsx가 상태를 가진다 */
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ReportSidebarDesktopContent({
  open,
  onOpenChange,
}: ReportSidebarToggleProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    MAX_YEAR_MONTH,
    yearMonth,
    setYearMonth,
    weeks,
    isLoading,
    openGroupId,
    setOpenGroupId,
  } = useReportSidebarState()

  const activeType = searchParams.get("type")
  const activeDate = searchParams.get("date")

  if (pathname !== TIMELINE_PAGE_PATH && pathname !== BRIEFING_PAGE_PATH) {
    return null
  }

  // 열림 270px / 닫힘 40px(열기 버튼만 있는 세로 막대) 사이를 폭 전환으로 오간다.
  // 살짝 넘쳤다 돌아오는 ease-bounce라 통통 튀며 열리고 닫힌다. 본문은 flex-1이라 폭을 따라 함께 움직인다
  return (
    <div
      className={cn(
        "sticky top-18.75 hidden h-[calc(100vh-75px)] shrink-0 overflow-hidden border-l border-border transition-[width] duration-500 ease-bounce md:block",
        open ? "w-67.5" : "w-10"
      )}
    >
      {/* 닫힘 상태의 열기 버튼 - 열릴 때는 바로 사라지고, 닫힐 때는 패널이 접힌 뒤에 나타난다 */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex w-10 justify-center pt-3 transition-opacity",
          open
            ? "pointer-events-none opacity-0 duration-100"
            : "opacity-100 delay-200 duration-200"
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="리포트 목록 열기"
          aria-expanded={false}
          title="리포트 목록 열기"
          tabIndex={open ? -1 : 0}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-neutral-400 transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <PanelRightOpen size={16} />
        </button>
      </div>

      {/* 패널 본문은 폭을 270px로 고정해 두고(전환 중 내용이 찌그러지지 않게) 밀려 들어오며 나타난다 */}
      <aside
        inert={!open}
        className={cn(
          "h-full w-67.5 min-w-67.5 overflow-y-auto transition-[opacity,translate] duration-500 ease-bounce",
          open
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-8 opacity-0"
        )}
      >
        <div>
          {/* 상단 월 교체 영역 */}
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-baseline gap-1.5">
              <strong className="text-[22px] font-bold">
                {String(yearMonth.month).padStart(2, "0")}월
              </strong>
              <span className="text-[12px] font-medium text-neutral-400">
                {yearMonth.year}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="이전 달"
                disabled={compareYearMonth(yearMonth, MIN_YEAR_MONTH) <= 0}
                onClick={() =>
                  setYearMonth((current) => shiftMonth(current, -1))
                }
                className="cursor-pointer rounded-md p-1 text-neutral-400 transition-colors duration-200 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size="16" />
              </button>
              <button
                type="button"
                aria-label="다음 달"
                disabled={compareYearMonth(yearMonth, MAX_YEAR_MONTH) >= 0}
                onClick={() =>
                  setYearMonth((current) => shiftMonth(current, 1))
                }
                className="cursor-pointer rounded-md p-1 text-neutral-400 transition-colors duration-200 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size="16" />
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="리포트 목록 닫기"
                aria-expanded
                title="리포트 목록 닫기"
                className="ml-1 cursor-pointer rounded-md p-1 text-neutral-400 transition-colors duration-200 hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800"
              >
                <PanelRightClose size="16" />
              </button>
            </div>
          </div>
          <Separator className="w-full" />
        </div>

        <div className="flex flex-col py-3">
          {isLoading && (
            <div className="flex flex-col gap-3 px-5 py-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          )}

          {!isLoading && weeks && weeks.length === 0 && (
            <p className="px-5 py-6 text-center text-[12px] leading-relaxed text-neutral-400">
              아직 리포트가 생성되지 않았습니다.
            </p>
          )}

          {!isLoading &&
            weeks &&
            weeks.map((group) => {
              const isOpen = openGroupId === group.id

              return (
                <div
                  key={group.id}
                  className="h-full border-b border-neutral-100 last:border-b-0 dark:border-neutral-800"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroupId((current) =>
                        current === group.id ? null : group.id
                      )
                    }
                    className="flex w-full cursor-pointer items-center justify-between px-5 py-3 text-left"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      <span
                        className={cn(
                          "size-1.5 rounded-full transition-all duration-300",
                          isOpen ? "bg-point" : "bg-neutral-300"
                        )}
                      />
                      {group.rangeLabel}
                    </span>
                    {/* 위/아래 아이콘을 바꿔 끼우지 않고 하나를 회전시켜, 열고 닫을 때 통통 튀며 돈다 */}
                    <ChevronDown
                      size="16"
                      className={cn(
                        "text-neutral-400 transition-transform duration-300 ease-bounce",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "grid h-full transition-all duration-300 ease-in-out",
                      isOpen
                        ? "grid-rows-[1fr] bg-[#f4f4f5] opacity-100 dark:bg-card"
                        : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <ul
                      className={cn(
                        "flex flex-col gap-3 overflow-hidden px-5 transition-all duration-300",
                        isOpen ? "py-3" : "py-0"
                      )}
                    >
                      {group.items.map((item) => {
                        const isActive =
                          activeType === item.type && activeDate === item.date

                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() =>
                                router.push(
                                  `${BRIEFING_PAGE_PATH}?type=${item.type}&date=${item.date}`
                                )
                              }
                              className={cn(
                                "relative flex w-full cursor-pointer items-start gap-3 rounded-xl border bg-card px-2 py-3 text-left shadow-sm transition-colors duration-200",
                                isActive
                                  ? "border-point shadow-point/40"
                                  : "border-border hover:bg-muted"
                              )}
                            >
                              <Badge
                                className={cn(
                                  "absolute -top-2 right-3 text-[10px] transition-colors duration-200",
                                  isActive
                                    ? "bg-point text-white"
                                    : "border border-neutral-200 bg-white text-neutral-400"
                                )}
                              >
                                {item.badgeLabel}
                              </Badge>
                              <div
                                className={cn(
                                  "flex w-9 flex-col items-center justify-center rounded-lg py-1 text-[10px] font-medium transition-colors duration-200",
                                  isActive
                                    ? "bg-point text-white"
                                    : "bg-neutral-100 text-neutral-500"
                                )}
                              >
                                <span className="opacity-80">{item.month}</span>
                                <strong className="text-[18px] leading-4 font-bold">
                                  {item.dateLabel}
                                </strong>
                                <span className="opacity-80">
                                  {item.unitLabel}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-1 text-[13px] font-semibold text-card-foreground">
                                  {item.title}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {item.description}
                                </p>
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              )
            })}
        </div>
      </aside>
    </div>
  )
}

/** 데스크톱 전용 사이드바(타임라인·브리핑 공통). (main)/layout.tsx에서 전역으로 마운트한다. */
export default function ReportSidebar(props: ReportSidebarToggleProps) {
  return (
    <Suspense fallback={null}>
      <ReportSidebarDesktopContent {...props} />
    </Suspense>
  )
}
