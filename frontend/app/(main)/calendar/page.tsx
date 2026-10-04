"use client"

import "flag-icons/css/flag-icons.min.css"
import {
  addDays,
  addMonths,
  endOfDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PageTitle } from "@/components/common"
import { WeekPlan } from "@/components/calendar/Weekplan"
import { BeginnerLessonDialog } from "@/components/calendar/beginner-lesson-dialog"
import { BeginnerLessonTeaser } from "@/components/calendar/beginner-lesson-teaser"
import {
  BeginnerLessonTeaserSkeleton,
  MonthGridSkeleton,
  WeekListSkeleton,
  WeekPlanSkeleton,
} from "@/components/calendar/calendar-skeletons"
import { FilterBar } from "@/components/calendar/filter-bar"
import { MiniCalendar } from "@/components/calendar/mini-calendar"
import { MonthGrid } from "@/components/calendar/month-grid"
import { WeekList } from "@/components/calendar/week-list"
import { getCalendarEvents } from "@/lib/api/calendar"
import { EMPTY_STATE_BOX, SECTION_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"
import {
  toggleCategory,
  type GroupFilter,
  type RegionFilter,
  type ViewMode,
} from "@/lib/calendar"
import { pickWeeklyLesson, weeklyKeywordTags } from "./beginner-lessons"
import {
  CATEGORY_GROUPS,
  CATS,
  MARKET_HOLIDAYS,
  dedupeNewsItems,
  scopeOf,
  toNewsItem,
  type Category,
  type NewsItem,
} from "./news-data"
import { DayDetailDialog, dayGroupOf, type DayGroup } from "./news-panel"

export default function CalendarPage() {
  const today = useMemo(() => new Date(), [])
  const currentYear = today.getFullYear()
  const [month, setMonth] = useState<Date>(() => startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  // 앱(모바일)은 주별 고정이라 기본값도 주별로 시작
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  // 상단 탭(전체/경제지표/실적) — 바뀌면 아래 서브 카테고리 선택은 초기화
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all")
  // 서브 카테고리 다중 선택(현재 탭이 갖는 카테고리 중에서만 선택 가능)
  const [categorySet, setCategorySet] = useState<Set<Category>>(new Set())
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all")
  const [popup, setPopup] = useState<{
    group: DayGroup
    itemId: string
  } | null>(null)
  const [beginnerLessonOpen, setBeginnerLessonOpen] = useState(false)
  // 현재 달 그리드에 걸치는 이전/다음 달 여분 날짜까지 포함한 전체(비필터) 일정
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  // 새로고침·월 이동 등으로 재조회하는 동안 각 영역에 스켈레톤을 보여주기 위한 상태
  const [loading, setLoading] = useState(true)
  const [unavailableYear, setUnavailableYear] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const requestIdRef = useRef(0)

  // 월간 그리드는 앞뒤 달의 여분 날짜도 보여주므로 이전/현재/다음 달을 함께 조회
  const fetchNews = useCallback(
    async (anchor: Date) => {
      const requestId = ++requestIdRef.current
      setLoading(true)
      setLoadError(false)
      if (anchor.getFullYear() !== currentYear) {
        setAllNews([])
        setUnavailableYear(anchor.getFullYear())
        setLoading(false)
        return
      }

      setUnavailableYear(null)
      try {
        const months = [
          addMonths(anchor, -1),
          anchor,
          addMonths(anchor, 1),
        ].filter((m) => m.getFullYear() === currentYear)
        const results = await Promise.allSettled(
          months.map((m) =>
            getCalendarEvents(m.getFullYear(), m.getMonth() + 1)
          )
        )
        if (requestId !== requestIdRef.current) return

        const successfulResults = results
          .filter(
            (
              result
            ): result is PromiseFulfilledResult<
              Awaited<ReturnType<typeof getCalendarEvents>>
            > => result.status === "fulfilled"
          )
          .flatMap((result) => result.value)
        const hasFailure = results.some(
          (result) => result.status === "rejected"
        )
        const items = successfulResults
          .map(toNewsItem)
          .filter((n): n is NewsItem => n !== null)
        setAllNews(dedupeNewsItems(items))
        setLoadError(hasFailure)
      } catch (error) {
        console.error("[getCalendarEvents] 실패", error)
        if (requestId === requestIdRef.current) {
          setAllNews([])
          setLoadError(true)
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    },
    [currentYear]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchNews(month)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchNews, month, retryToken])

  const selectGroup = (g: GroupFilter) => {
    setGroupFilter(g)
    setCategorySet(new Set())
  }

  // 현재 탭에서 고를 수 있는 서브 카테고리 — '전체'면 전체 5종
  const subCategories =
    groupFilter === "all" ? CATS : CATEGORY_GROUPS[groupFilter].categories

  // 서브 카테고리 토글 — '전체' 상태(빈 집합)에서 하나를 누르면 그 하나만 선택되고,
  // 개별 항목을 전부 선택하면 자동으로 다시 '전체' 상태(빈 집합)로 접힌다.
  const toggleSubCategory = (c: Category) => {
    setCategorySet((s) => {
      const next = toggleCategory(s, c)
      return next.size === subCategories.length ? new Set() : next
    })
  }

  const selectAllCategories = () => setCategorySet(new Set())

  const selectDate = (d: Date) => {
    setSelectedDate(d)
    if (!isSameMonth(d, month)) setMonth(startOfMonth(d))
  }

  const openDay = (d: Date) => {
    const g = dayGroupOf(d, allNews)
    if (g) setPopup({ group: g, itemId: g.list[0].id })
  }

  const openItem = (g: DayGroup, itemId: string) =>
    setPopup({ group: g, itemId })

  // AI 요약 카드에서 항목 클릭 시 — 요약이 카드 안에서 다 안 보이니 상세 팝업으로 전체 내용을 보여준다
  const openWeekSummaryItem = (n: NewsItem) => {
    const g = dayGroupOf(n.publishedAt, allNews)
    if (g) setPopup({ group: g, itemId: n.id })
  }

  const filteredNews = useMemo(
    () =>
      allNews.filter(
        (n) =>
          (groupFilter === "all" ||
            CATEGORY_GROUPS[groupFilter].categories.includes(n.category)) &&
          (categorySet.size === 0 || categorySet.has(n.category)) &&
          (regionFilter === "all" || scopeOf(n.region) === regionFilter)
      ),
    [allNews, groupFilter, categorySet, regionFilter]
  )

  const filteredHolidays = useMemo(
    () =>
      MARKET_HOLIDAYS.filter(
        (h) => regionFilter === "all" || h.scope === regionFilter
      ),
    [regionFilter]
  )

  // AI 요약 카드용 — 선택한 날짜가 속한 주(월~토)의 실제 일정만 모음(필터와 무관하게 항상 전체 기준)
  const weekStartMs = useMemo(
    () => +startOfWeek(selectedDate, { weekStartsOn: 1 }),
    [selectedDate]
  )
  const weekNews = useMemo(() => {
    const weekStart = new Date(weekStartMs)
    const weekEnd = endOfDay(addDays(weekStart, 5))
    return allNews
      .filter((n) => n.publishedAt >= weekStart && n.publishedAt <= weekEnd)
      .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
  }, [allNews, weekStartMs])

  // 주린이 교육 카드용 — 이번 주 실제 일정 중 우선순위가 가장 높은 주제 하나만 고른다
  const weeklyLesson = useMemo(() => pickWeeklyLesson(weekNews), [weekNews])
  const weeklyLessonTags = useMemo(
    () => weeklyKeywordTags(weekNews),
    [weekNews]
  )
  const emptyMessage =
    allNews.length === 0
      ? "조회된 일정이 없습니다."
      : "현재 필터 조건에 맞는 일정이 없습니다."

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full flex-col gap-6">
        {/* 로고 바로 아래, 페이지 맨 위에 고정되는 타이틀 */}
        <PageTitle
          title="주요 경제 지표와 이벤트 일정"
          description="수익을 좌우할 미래의 주요 경제 지표와 기업 일정을 미리 모아 대비합니다."
        />

        <div className="flex min-w-0 flex-col-reverse gap-6 lg:flex-row">
          {/* 왼쪽: 필터 + 월간/주간 뷰 */}
          <section className={cn(SECTION_CARD, "flex h-max min-w-0 flex-1 flex-col gap-3")}>
            {/* 필터 — 웹에서는 스크롤해도 상단에 붙어서 따라옴. 데스크톱에서는 탭/토글과 같은 줄 가운데에 현재 월도 같이 표시(주별·월별 공통) */}
            <div className="lg:sticky lg:top-18.75 lg:z-10 lg:-mx-5 lg:bg-card lg:px-5 lg:pt-4 lg:pb-3">
              <FilterBar
                groupFilter={groupFilter}
                onSelectGroup={selectGroup}
                regionFilter={regionFilter}
                onSetRegionFilter={setRegionFilter}
                viewMode={viewMode}
                onSetViewMode={setViewMode}
                subCategories={subCategories}
                categorySet={categorySet}
                onToggleCategory={toggleSubCategory}
                onSelectAllCategories={selectAllCategories}
                month={month}
                onMonthChange={setMonth}
              />
            </div>

            {unavailableYear !== null ? (
              <div className={cn(EMPTY_STATE_BOX, "flex min-h-64 items-center justify-center")}>
                {unavailableYear < currentYear
                  ? "이전 연도의 데이터는 제공하지 않습니다."
                  : "아직 제공되지 않는 일정입니다."}
              </div>
            ) : loadError && allNews.length === 0 ? (
              <div className={cn(EMPTY_STATE_BOX, "flex min-h-64 flex-col items-center justify-center gap-3")}>
                <p>일정을 불러오지 못했습니다.</p>
                <button
                  type="button"
                  onClick={() => setRetryToken((token) => token + 1)}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <>
                {loadError && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span>일부 일정만 불러왔습니다.</span>
                    <button
                      type="button"
                      onClick={() => setRetryToken((token) => token + 1)}
                      className="shrink-0 font-semibold underline underline-offset-2"
                    >
                      다시 시도
                    </button>
                  </div>
                )}
                {/* 앱(모바일): 커다란 월간 캘린더 없이 주별 일정만 표시 */}
                <div className="lg:hidden">
                  {loading ? (
                    <WeekListSkeleton />
                  ) : (
                    <WeekList
                      month={month}
                      selectedDate={selectedDate}
                      news={filteredNews}
                      allNews={allNews}
                      holidays={filteredHolidays}
                      onOpenItem={openItem}
                      emptyMessage={emptyMessage}
                    />
                  )}
                </div>

                {/* 데스크톱: 주별/월별 전환 가능 */}
                <div className="hidden lg:block">
                  {loading ? (
                    viewMode === "month" ? (
                      <MonthGridSkeleton />
                    ) : (
                      <WeekListSkeleton />
                    )
                  ) : viewMode === "month" ? (
                    <MonthGrid
                      month={month}
                      today={today}
                      selectedDate={selectedDate}
                      news={filteredNews}
                      allNews={allNews}
                      holidays={filteredHolidays}
                      onSelectDate={selectDate}
                      onOpenDay={openDay}
                      onOpenItem={openItem}
                    />
                  ) : (
                    <WeekList
                      month={month}
                      selectedDate={selectedDate}
                      news={filteredNews}
                      allNews={allNews}
                      holidays={filteredHolidays}
                      onOpenItem={openItem}
                      emptyMessage={emptyMessage}
                    />
                  )}
                </div>
              </>
            )}
          </section>

          {/* 오른쪽: 미니 달력 + AI 요약 — 앱(360) 사이즈에서는 페이지 최상단에 세로로 노출, 웹에서는 스크롤해도 따라오도록 sticky */}
          <aside className="flex w-full shrink-0 flex-col gap-6 lg:sticky lg:top-23.75 lg:w-72 lg:self-start">
            <MiniCalendar
              month={month}
              today={today}
              selectedDate={selectedDate}
              viewMode={viewMode}
              onMonthChange={setMonth}
              onSelectDate={selectDate}
              onToday={() => {
                setMonth(startOfMonth(today))
                setSelectedDate(today)
              }}
            />
            <div className="hidden lg:block">
              {loading ? (
                <BeginnerLessonTeaserSkeleton />
              ) : (
                <BeginnerLessonTeaser
                  data={weeklyLesson}
                  tags={weeklyLessonTags}
                  onOpen={() => setBeginnerLessonOpen(true)}
                />
              )}
            </div>
            <div className="order-2 lg:order-0">
              {loading ? (
                <WeekPlanSkeleton />
              ) : (
                <WeekPlan items={weekNews} onOpenItem={openWeekSummaryItem} />
              )}
            </div>
          </aside>
        </div>

        <div className="lg:hidden">
          {loading ? (
            <BeginnerLessonTeaserSkeleton />
          ) : (
            <BeginnerLessonTeaser
              data={weeklyLesson}
              tags={weeklyLessonTags}
              onOpen={() => setBeginnerLessonOpen(true)}
            />
          )}
        </div>
      </div>

      <DayDetailDialog popup={popup} onClose={() => setPopup(null)} />
      <BeginnerLessonDialog
        open={beginnerLessonOpen}
        data={weeklyLesson}
        onClose={() => setBeginnerLessonOpen(false)}
      />
    </div>
  )
}
