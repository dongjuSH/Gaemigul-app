import { useRef } from "react"

import { useRecordSlotVisit } from "@/hooks/use-record-slot-visit"
import type { ScheduleItem, TimelineContent } from "@/lib/types/TimelineType"
import BeginnerSummarySection from "./BeginnerSummarySection"
import FeaturedStockGrid from "./FeaturedStockGrid"
import LLMSummarySection from "./LLMSummarySection"
import MarketStatGrid from "./MarketStatGrid"
import NewsList from "./NewsList"
import SectorGrid from "./SectorGrid"
import TimelineLockedSection from "./TimelineLockedSection"
import TimelineSectionHeader from "./TimelineSectionHeader"
import { SECTION_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

type TimelineSectionProps = {
  item: ScheduleItem
  /** 백엔드에 해당 슬롯이 아직 없으면 null — 이때는 잠금 화면을 보여준다. */
  content: TimelineContent | null
  glossary: Record<string, string>
  /** "굴 파기 기록" 카운트 대상 여부 - 로그인 + 오늘 날짜를 보고 있을 때만 true로 내려온다 */
  trackVisit?: boolean
}

export default function TimelineSection({
  item,
  content,
  glossary,
  trackVisit = false,
}: TimelineSectionProps) {
  const isOpen = content !== null
  const isPending = item.status === "next" || item.status === "upcoming"
  const sectionRef = useRef<HTMLElement>(null)
  useRecordSlotVisit(sectionRef, item.id, trackVisit && isOpen)

  return (
    <section
      ref={sectionRef}
      id={item.id}
      className="flex w-full scroll-mt-[calc(var(--header-height,75px)+64px)] flex-col gap-5"
    >
      <TimelineSectionHeader
        title={item.title}
        time={item.time}
        infoText={item.infoText}
      />

      {isOpen && content ? (
        <div className={cn(SECTION_CARD, "flex w-full flex-col gap-10")}>
          {content.marketStats && (
            <MarketStatGrid groups={content.marketStats} />
          )}
          <LLMSummarySection summary={content.llmSummary} glossary={glossary} />
          <BeginnerSummarySection
            summary={content.beginnerSummary}
            glossary={glossary}
          />
          <NewsList news={content.news} />
          {content.sectors && <SectorGrid sectors={content.sectors} />}
          {content.featuredStocks && (
            <FeaturedStockGrid stocks={content.featuredStocks} />
          )}
        </div>
      ) : (
        <TimelineLockedSection time={item.time} pending={isPending} />
      )}
    </section>
  )
}
