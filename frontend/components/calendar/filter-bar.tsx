"use client"

import { addMonths, format, subMonths } from "date-fns"
import { ko } from "date-fns/locale/ko"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CAT,
  CATEGORY_GROUPS,
  type Category,
  type CategoryGroupId,
} from "@/app/(main)/calendar/news-data"
import {
  groupSegBtn,
  navBtn,
  segBtn,
  type GroupFilter,
  type RegionFilter,
  type ViewMode,
} from "@/lib/calendar"

export function FilterBar({
  groupFilter,
  onSelectGroup,
  regionFilter,
  onSetRegionFilter,
  viewMode,
  onSetViewMode,
  subCategories,
  categorySet,
  onToggleCategory,
  onSelectAllCategories,
  month,
  onMonthChange,
}: {
  groupFilter: GroupFilter
  onSelectGroup: (g: GroupFilter) => void
  regionFilter: RegionFilter
  onSetRegionFilter: (r: RegionFilter) => void
  viewMode: ViewMode
  onSetViewMode: (v: ViewMode) => void
  subCategories: Category[]
  categorySet: Set<Category>
  onToggleCategory: (c: Category) => void
  /** 서브 카테고리 '전체' 클릭 — categorySet을 비운다(=전부 표시) */
  onSelectAllCategories: () => void
  /** 데스크톱에서 탭/토글과 같은 줄 가운데에 표시할 현재 월(주별·월별 뷰 공통) */
  month: Date
  onMonthChange: (d: Date) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto scrollbar-none lg:grid lg:grid-cols-[auto_1fr_auto] lg:overflow-visible">
        <div className="flex flex-1 gap-1 rounded-full bg-neutral-100 p-1 text-xs lg:col-start-1 lg:flex-none lg:shrink-0 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => onSelectGroup("all")}
            className={groupSegBtn(groupFilter === "all")}
          >
            전체
          </button>
          {(Object.keys(CATEGORY_GROUPS) as CategoryGroupId[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onSelectGroup(g)}
              className={groupSegBtn(groupFilter === g)}
            >
              {CATEGORY_GROUPS[g].label}
            </button>
          ))}
        </div>

        <div className="hidden items-center justify-center gap-2 lg:col-start-2 lg:flex">
          <button
            type="button"
            onClick={() => onMonthChange(subMonths(month, 1))}
            aria-label="이전 달"
            className={navBtn}
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="w-40 text-center text-2xl font-bold tabular-nums">
            {format(month, "yyyy년 M월", { locale: ko })}
          </span>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            aria-label="다음 달"
            className={navBtn}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* 국내/해외, 뷰 전환(주별/월별) — 앱(모바일)에서는 둘 다 숨김 */}
        <div className="hidden shrink-0 items-center gap-1 lg:col-start-3 lg:flex">
          <div className="flex gap-1 rounded-full bg-neutral-100 p-1 text-xs dark:bg-neutral-800">
            {(["domestic", "overseas"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() =>
                  onSetRegionFilter(regionFilter === r ? "all" : r)
                }
                className={segBtn(regionFilter === r)}
              >
                {r === "domestic" ? "국내" : "해외"}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-full bg-neutral-100 p-1 text-xs dark:bg-neutral-800">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onSetViewMode(v)}
                className={segBtn(viewMode === v)}
              >
                {v === "week" ? "주별" : "월별"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 서브 카테고리 — 현재 탭(전체/경제지표/실적)에 속한 카테고리만 다중 선택. 아무것도 안 골랐으면(=categorySet 빈 집합) '전체'만 활성으로 보여준다 */}
      <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={onSelectAllCategories}
          aria-pressed={categorySet.size === 0}
          className={cn(
            "flex shrink-0 cursor-pointer items-center rounded-full border bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap transition-all hover:bg-muted",
            categorySet.size === 0
              ? "border-point/40 bg-point/10 text-point"
              : "opacity-40"
          )}
        >
          전체
        </button>
        {subCategories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onToggleCategory(c)}
            aria-pressed={categorySet.has(c)}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1 rounded-full border bg-muted/60 px-1.5 py-0.5 text-[11px] whitespace-nowrap transition-all hover:bg-muted",
              categorySet.has(c) &&
                "border-point/40 bg-point/10 font-medium text-point",
              categorySet.size > 0 && !categorySet.has(c) && "opacity-40"
            )}
          >
            <span
              className={cn("size-1.5 shrink-0 rounded-full", CAT[c].dot)}
            />
            {CAT[c].label}
          </button>
        ))}
      </div>
    </div>
  )
}
