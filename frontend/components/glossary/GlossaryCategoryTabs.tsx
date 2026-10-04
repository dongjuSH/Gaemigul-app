"use client"

import { useEffect, useRef } from "react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui"
import { CATEGORY_FILTERS, type CategoryFilter } from "@/lib/glossary"
import { SEGMENT_LIST, SEGMENT_TRIGGER } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

/** "카테고리 필터" 칩 — GlossaryToneTabs와 같은 모양이지만 목록을 실제로 거른다.
 * 칩이 7개라 좁은 화면에서는 가로로 스크롤된다 */
export function GlossaryCategoryTabs({
  value,
  onChange,
}: {
  value: CategoryFilter
  onChange: (category: CategoryFilter) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<
    Partial<Record<CategoryFilter, HTMLElement | null>>
  >({})

  // 선택된 탭을 탭 줄 왼쪽 끝으로 가로 스크롤한다(모바일처럼 탭이 넘칠 때만 실제로 움직임).
  // 연관 태그 클릭으로 "전체"로 돌아가는 경우처럼 바깥에서 값이 바뀌어도 따라가도록 value 기준으로 처리한다
  useEffect(() => {
    const container = scrollRef.current
    const trigger = triggerRefs.current[value]
    if (!container || !trigger) return
    const left =
      trigger.getBoundingClientRect().left -
      container.getBoundingClientRect().left +
      container.scrollLeft
    // 탭 묶음 안쪽 여백(p-1)만큼은 남겨 둔다
    container.scrollTo({ left: Math.max(0, left - 4), behavior: "smooth" })
  }, [value])

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as CategoryFilter)}
      className="max-w-full min-w-0 max-md:w-full"
    >
      <div ref={scrollRef} className="max-w-full overflow-x-auto">
        <TabsList className={cn(SEGMENT_LIST, "max-md:min-w-full")}>
          {CATEGORY_FILTERS.map(({ key, label }) => (
            <TabsTrigger
              key={key}
              value={key}
              ref={(element) => {
                triggerRefs.current[key] = element
              }}
              className={cn(SEGMENT_TRIGGER, "shrink-0")}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
}
