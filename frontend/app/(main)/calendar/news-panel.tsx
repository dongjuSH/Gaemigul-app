"use client"

import { cn } from "@/lib/utils"
import { Dialog } from "@base-ui/react/dialog"
import { format, isSameDay } from "date-fns"
import { ko } from "date-fns/locale/ko"
import { ChevronDown, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { formatEconomicValue } from "@/lib/format-economic-value"
import { CAT, type NewsItem } from "./news-data"

export type DayGroup = {
  date: Date
  list: NewsItem[]
  badge: "focus" | "special" | null
}

/** 정렬된 같은 날 일정 배열 → 그룹 */
function buildDayGroup(list: NewsItem[]): DayGroup {
  return {
    date: list[0].publishedAt,
    list,
    badge: null,
  }
}

/** 일정 배열 → 시간순 정렬 후 날짜별 그룹 */
export function groupByDay(items: NewsItem[]): DayGroup[] {
  const byDay = new Map<string, NewsItem[]>()
  for (const n of [...items].sort(
    (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()
  )) {
    const k = format(n.publishedAt, "yyyy-MM-dd")
    byDay.set(k, [...(byDay.get(k) ?? []), n])
  }
  return [...byDay.values()].map(buildDayGroup)
}

/** 특정 날짜의 전체 일정(필터 무시) → 그룹. allNews는 캘린더가 들고 있는 전체(비필터) 목록. 없으면 null */
export function dayGroupOf(d: Date, allNews: NewsItem[]): DayGroup | null {
  return (
    groupByDay(allNews.filter((n) => isSameDay(n.publishedAt, d)))[0] ?? null
  )
}

/* ------------------------------------------------------------------ */

/** 일정 카드 / 캘린더 날짜 클릭 시 그날 일정 목록을 아코디언으로 보여주는 팝업 */
export function DayDetailDialog({
  popup,
  onClose,
}: {
  popup: { group: DayGroup; itemId: string } | null
  onClose: () => void
}) {
  return (
    <Dialog.Root open={!!popup} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        {/* 뒷배경은 투명도만, 모달은 살짝 작게 시작해 통통 튀며 커진다 (Base UI의 data-starting/ending-style 사용) */}
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-120 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-card shadow-lg transition-[opacity,scale] duration-300 ease-bounce data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0">
          {popup && (
            <DayDetailBody group={popup.group} initialId={popup.itemId} />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function DayDetailBody({
  group,
  initialId,
}: {
  group: DayGroup
  initialId: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // 일정이 여러 개면 아코디언(각각 열고 닫기), 하나면 항상 펼침
  const multiple = group.list.length > 1
  const [openIds, setOpenIds] = useState<Set<string>>(() =>
    multiple ? new Set([initialId]) : new Set(group.list.map((n) => n.id))
  )

  const toggleOpen = (id: string) =>
    setOpenIds((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })

  // 처음 클릭한 카드를 맨 위로
  useEffect(() => {
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-id="${initialId}"]`)
      ?.scrollIntoView({ block: "start" })
  }, [initialId])

  return (
    <>
      <div className="flex items-center justify-between border-b p-4">
        <Dialog.Title className="text-base font-bold">
          {format(group.date, "yyyy년 M월 d일 (EEE)", { locale: ko })}
        </Dialog.Title>
        <Dialog.Close
          aria-label="닫기"
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </Dialog.Close>
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
      >
        {group.list.map((n) => {
          const c = CAT[n.category]
          const isOpen = openIds.has(n.id)
          const facts = (
            [
              [n.detail?.actualLabel ?? "실제값", n.detail?.actual],
              ["이전치", n.detail?.previous],
            ] as const
          ).filter(([, v]) => v)
          return (
            <div
              key={n.id}
              data-id={n.id}
              className={cn(
                "relative overflow-hidden rounded-lg shadow-sm",
                c.card
              )}
            >
              <button
                type="button"
                onClick={() => multiple && toggleOpen(n.id)}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-2 p-3 text-left transition-colors",
                  multiple && "cursor-pointer hover:bg-muted/40"
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 font-semibold text-white tabular-nums",
                      c.dot
                    )}
                  >
                    {format(n.publishedAt, "HH:mm")}
                  </span>
                  <span
                    className={cn(
                      "truncate font-semibold",
                      !isOpen && "text-muted-foreground"
                    )}
                  >
                    {n.title}
                  </span>
                </span>
                {multiple && (
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                      isOpen && "rotate-180"
                    )}
                  />
                )}
              </button>

              {/* 펼침 영역: grid 0fr → 1fr 로 부드럽게 */}
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="space-y-2 px-3 pb-3 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span>{c.label}</span>
                      <span>· {n.region}</span>
                    </div>

                    {facts.length > 0 && (
                      <dl className="flex flex-wrap gap-x-4 gap-y-1">
                        {facts.map(([k, v]) => (
                          <div key={k} className="flex gap-1">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="font-medium" title={v}>
                              {formatEconomicValue(v)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    <p className="rounded py-2 leading-relaxed text-muted-foreground">
                      {n.summary}
                    </p>

                    {n.detail?.sectors && n.detail.sectors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-muted-foreground">
                          관련 수혜 섹터
                        </span>
                        {n.detail.sectors.map((s) => (
                          <span
                            key={s}
                            className="rounded-full border px-1.5 py-0.5 text-[11px]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t p-3">
        <Dialog.Close className="w-full cursor-pointer rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          확인
        </Dialog.Close>
      </div>
    </>
  )
}
