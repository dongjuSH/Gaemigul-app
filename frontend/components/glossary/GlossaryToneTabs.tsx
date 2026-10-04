"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui"
import { TONE_FILTERS, type ToneFilter } from "@/lib/glossary"
import { SEGMENT_LIST, SEGMENT_TRIGGER } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

/** 페이지 상단 "난이도 필터" 칩 — 목록을 거르지 않고 모든 카드의 설명 톤을 한꺼번에 바꾼다 */
export function GlossaryToneTabs({
  value,
  onChange,
}: {
  value: ToneFilter
  onChange: (tone: ToneFilter) => void
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as ToneFilter)}
      className="max-md:w-full"
    >
      {/* 모바일: 탭 줄을 화면 폭만큼 꽉 채운다 (각 탭이 같은 폭으로 늘어남) */}
      <TabsList className={cn(SEGMENT_LIST, "max-md:w-full")}>
        {TONE_FILTERS.map(({ key, label }) => (
          <TabsTrigger
            key={key}
            value={key}
            // 모바일: 4개 탭이 한 줄 폭 안에 들어가도록 좌우 여백을 줄인다
            className={cn(SEGMENT_TRIGGER, "max-md:px-2")}
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
