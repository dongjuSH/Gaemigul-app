"use client"

import { Dialog } from "@base-ui/react/dialog"
import { format } from "date-fns"
import { ko } from "date-fns/locale/ko"
import { Check, X } from "lucide-react"
import { type ReactNode, useState } from "react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui"
import type {
  AnalogyBlock,
  BeginnerLesson,
} from "@/app/(main)/calendar/beginner-lessons"
import type { NewsItem } from "@/app/(main)/calendar/news-data"

type LessonData = { lesson: BeginnerLesson; matchedEvent: NewsItem }

/** 앞에 붙은 이모지 한 글자(+공백)를 지운다 — 콘텐츠 데이터의 문구는 그대로 두고 표시할 때만 정리 */
function stripLeadingEmoji(s: string): string {
  return s.replace(/^\p{Extended_Pictographic}️?\s*/u, "")
}

/** "3분 만에 알아보기" 클릭 시 뜨는 교육 팝업 — DayDetailDialog와 같은 Dialog 프리미티브/스타일을 재사용한다 */
export function BeginnerLessonDialog({
  open,
  data,
  onClose,
}: {
  open: boolean
  data: LessonData | null
  onClose: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        {/* 뒷배경은 투명도만, 모달은 살짝 작게 시작해 통통 튀며 커진다 (Base UI의 data-starting/ending-style 사용) */}
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-90 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-card shadow-lg transition-[opacity,scale] duration-300 ease-bounce data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0 sm:max-w-160">
          {open && data && (
            <LessonBody lesson={data.lesson} matchedEvent={data.matchedEvent} />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const SECTION_TITLES = {
  overview: "한눈에 보기",
  connection: "주식시장과 무슨 상관이 있지?",
  remember: "꼭 기억할 것",
  calendarLink: "이번 주 캘린더와 연결",
  quiz: "10초 주린이 퀴즈",
} as const

type QuizStatus = "idle" | "wrong" | "correct"

function LessonBody({ lesson, matchedEvent }: LessonData) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<QuizStatus>("idle")

  const selectOption = (id: string) => {
    if (status === "correct") return
    setSelectedId(id)
    setStatus("idle")
  }

  const checkAnswer = () => {
    if (!selectedId) return
    setStatus(selectedId === lesson.quiz.answerId ? "correct" : "wrong")
  }

  const selectedOption = lesson.quiz.options.find((o) => o.id === selectedId)

  return (
    <>
      <div className="flex items-center justify-between border-b p-4">
        <Dialog.Title className="text-lg leading-snug font-bold">
          {lesson.hookTitle}
        </Dialog.Title>
        <Dialog.Close
          aria-label="닫기"
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </Dialog.Close>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        <Section index={1} title={SECTION_TITLES.overview}>
          <p className="font-semibold text-foreground">
            {lesson.overview.term}
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {lesson.overview.definition}
          </p>
        </Section>

        <Section index={2} title={analogyTitle(lesson.analogy)}>
          <AnalogyView block={lesson.analogy} />
        </Section>

        <Section index={3} title={SECTION_TITLES.connection}>
          <ChainList chain={lesson.connection.chain} />
          <p className="mt-2 leading-relaxed text-muted-foreground">
            {lesson.connection.caveat}
          </p>
        </Section>

        <Section index={4} title={SECTION_TITLES.remember}>
          <ul className="space-y-1 leading-relaxed text-muted-foreground">
            {lesson.remember.map((r) => (
              <li key={r} className="flex gap-1.5">
                <span className="text-muted-foreground">–</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section index={5} title={SECTION_TITLES.calendarLink}>
          <p className="mb-2 font-medium text-foreground">
            {format(matchedEvent.publishedAt, "M월 d일 (EEE)", { locale: ko })}{" "}
            · {matchedEvent.title}
          </p>
          <ChainList chain={lesson.calendarLinkChain} />
        </Section>

        <Section index="❓" title={SECTION_TITLES.quiz} highlight last>
          <p className="mb-2 leading-relaxed text-foreground">
            {lesson.quiz.question}
          </p>
          <div className="divide-y rounded-md border">
            {lesson.quiz.options.map((opt) => {
              const isSelected = selectedId === opt.id
              const isWrongPick = status === "wrong" && isSelected
              const isCorrectPick = status === "correct" && isSelected
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={status === "correct"}
                  onClick={() => selectOption(opt.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left transition-colors",
                    !isSelected && "text-foreground",
                    isSelected &&
                      status === "idle" &&
                      "bg-amber-100 font-semibold text-amber-900 ring-1 ring-amber-400 ring-inset dark:bg-amber-400/15 dark:text-amber-200",
                    isWrongPick && "bg-red-500/15 font-medium text-red-700",
                    isCorrectPick &&
                      "bg-emerald-500/15 font-medium text-emerald-700",
                    status === "correct" && "cursor-default"
                  )}
                >
                  <span>{opt.label}</span>
                  {isSelected && status === "idle" && (
                    <Check className="size-4 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          {status !== "correct" && (
            <button
              type="button"
              disabled={!selectedId}
              onClick={checkAnswer}
              className="mt-3 w-full cursor-pointer rounded-md bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              정답 확인
            </button>
          )}

          {status === "wrong" && (
            <div className="mt-2 space-y-1 rounded-md bg-red-500/10 p-2 leading-relaxed text-red-700">
              <p>오답이에요. 다른 보기를 선택해 다시 시도해보세요.</p>
              {selectedOption?.reason && (
                <p className="text-red-700/80">{selectedOption.reason}</p>
              )}
            </div>
          )}

          {status === "correct" && (
            <div className="mt-3 space-y-1.5 rounded-md bg-emerald-500/10 p-3">
              <p className="font-semibold text-emerald-700">정답이에요.</p>
              <p className="leading-relaxed text-muted-foreground">
                {lesson.quiz.explanation}
              </p>
              <p className="pt-1 text-[11px] font-medium text-foreground">
                주린이 탈출, 얼마 남지 않았어요!
              </p>
            </div>
          )}
        </Section>
      </div>

      <div className="border-t p-3">
        <Dialog.Close className="w-full cursor-pointer rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          확인
        </Dialog.Close>
      </div>
    </>
  )
}

function Section({
  index,
  title,
  children,
  highlight,
  last,
}: {
  index: number | string
  title: string
  children: ReactNode
  highlight?: boolean
  last?: boolean
}) {
  return (
    <section
      className={cn(
        "first:pt-0",
        highlight
          ? "mt-3 rounded-xl border-2 border-foreground bg-muted p-4"
          : "py-3"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {typeof index === "number" ? (
          <span className="text-sm font-bold text-[#ff2a2a] tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
        ) : (
          <span className="text-base">{index}</span>
        )}
        <h3 className="text-base font-bold text-foreground">{title}</h3>
      </div>
      {children}
      {!last && <Separator className="mt-3" />}
    </section>
  )
}

function ChainList({ chain }: { chain: string[] }) {
  return (
    <ol className="space-y-1 leading-relaxed text-foreground">
      {chain.map((step, i) => (
        <li key={step} className="flex gap-1.5">
          <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
          <span>{stripLeadingEmoji(step)}</span>
        </li>
      ))}
    </ol>
  )
}

function analogyTitle(block: AnalogyBlock): string {
  if (block.kind === "priceTable") return "장바구니로 이해하기"
  if (block.kind === "statCard") return "숫자로 이해하기"
  return "쉽게 풀어보면"
}

function AnalogyView({ block }: { block: AnalogyBlock }) {
  if (block.kind === "priceTable") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <PriceList title="작년" rows={block.before} />
          <PriceList title="올해" rows={block.after} />
        </div>
        <p className="leading-relaxed text-muted-foreground">
          {block.punchline}
        </p>
      </div>
    )
  }

  if (block.kind === "statCard") {
    return (
      <div className="space-y-2">
        <dl className="divide-y rounded-md border">
          {block.stats.map((s) => (
            <div
              key={s.label}
              className="flex items-baseline justify-between px-2 py-1.5"
            >
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd className="pl-2 text-right font-semibold text-foreground">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="leading-relaxed text-muted-foreground">
          {block.punchline}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1 leading-relaxed text-muted-foreground">
        {block.items.map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className="text-muted-foreground">–</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="leading-relaxed text-muted-foreground">{block.punchline}</p>
    </div>
  )
}

function PriceList({
  title,
  rows,
}: {
  title: string
  rows: { emoji: string; label: string; price: string }[]
}) {
  return (
    <div className="rounded-md border p-2">
      <p className="mb-1 text-[10px] font-semibold text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between">
            <span>{r.label}</span>
            <span className="font-medium tabular-nums">{r.price}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
