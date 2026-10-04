"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "cn"

import type { NewsItem } from "@/lib/types/TimelineType"

type NewsListProps = {
  news: NewsItem[]
}

// 뉴스가 이 개수 이상이면 그리드 대신 가로 슬라이드로 전환한다.
const SLIDE_THRESHOLD = 4
// 스크롤 끝에 거의 도달했다고 볼 오차 허용치(px)
const SCROLL_EDGE_THRESHOLD = 4

export default function NewsList({ news }: NewsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isSlider = news.length >= SLIDE_THRESHOLD
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = () => {
    const container = scrollRef.current
    if (!container) return

    setCanScrollLeft(container.scrollLeft > SCROLL_EDGE_THRESHOLD)
    setCanScrollRight(
      container.scrollWidth - container.clientWidth - container.scrollLeft >
        SCROLL_EDGE_THRESHOLD
    )
  }

  useEffect(() => {
    if (!isSlider) return

    updateScrollState()

    window.addEventListener("resize", updateScrollState)
    return () => window.removeEventListener("resize", updateScrollState)
  }, [isSlider, news])

  const scrollByCard = (direction: 1 | -1) => {
    const container = scrollRef.current
    if (!container) return

    const card = container.querySelector<HTMLElement>("[data-news-card]")
    const amount = (card?.offsetWidth ?? 280) + 12
    container.scrollBy({ left: amount * direction, behavior: "smooth" })
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <h3 className="text-base font-bold text-foreground">주요 뉴스</h3>

      <div className={cn("relative w-full", isSlider && "group")}>
        <div
          ref={scrollRef}
          onScroll={isSlider ? updateScrollState : undefined}
          className={cn(
            isSlider
              ? "flex w-full snap-x snap-mandatory scrollbar-none gap-3 overflow-x-auto scroll-smooth pb-1"
              : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          )}
        >
          {news.map((item) => (
            <Link
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              data-news-card
              className={cn(
                "flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-shadow duration-200 hover:shadow-md",
                isSlider && "w-56 shrink-0 snap-start"
              )}
            >
              <p className="line-clamp-4 text-xs leading-relaxed text-card-foreground">
                {item.content}
              </p>
              <span className="text-[11px] font-medium text-neutral-400">
                {item.source}
              </span>
            </Link>
          ))}
        </div>

        {isSlider && (
          <>
            {/* 왼쪽/오른쪽에 아직 볼 카드가 남아 있을 때만 그라데이션으로 힌트를 준다.
                실제로 카드 뒤에 깔린 배경(TimelineSection의 bg-card)과 같은 색에서 투명으로
                빠지게 해야 다크모드에서도 흰 띠로 뜨지 않는다 */}
            <div
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-14 bg-linear-to-r from-card to-transparent transition-opacity duration-200",
                canScrollLeft ? "opacity-100" : "opacity-0"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 w-14 bg-linear-to-l from-card to-transparent transition-opacity duration-200",
                canScrollRight ? "opacity-100" : "opacity-0"
              )}
            />

            {canScrollLeft && (
              <button
                type="button"
                aria-label="이전 뉴스"
                onClick={() => scrollByCard(-1)}
                className="absolute top-1/2 left-1 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 hover:text-foreground"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            {canScrollRight && (
              <button
                type="button"
                aria-label="다음 뉴스"
                onClick={() => scrollByCard(1)}
                className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 hover:text-foreground"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
