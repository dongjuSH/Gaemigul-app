"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { isSameDay } from "date-fns"

import { Button, Separator, Skeleton } from "@/components/ui"
import { getPromotionSuggestion, respondToPromotionSuggestion } from "@/lib/api/auth"
import { getCalendarEvents } from "@/lib/api/calendar"
import { trackEvent } from "@/lib/analytics"
import { getHeatmap } from "@/lib/api/heatmap"
import { isAfterMarketClose } from "@/lib/heatmap-format"
import { getTimelineDay } from "@/lib/api/timeline"
import { cn } from "@/lib/utils"
import { toNewsItem, type NewsItem } from "@/app/(main)/calendar/news-data"
import type { PromotionSuggestion } from "@/lib/types/AuthType"
import type { HeatmapResponse } from "@/lib/types/HeatmapType"
import type { ApiTimelineSlot } from "@/lib/types/TimelineType"
import { ArrowRight, MessageCircle, Sparkles, X } from "lucide-react"
import { useAuth } from "./auth/AuthContext"

type ChipTone = "neutral" | "info" | "accent"

const CHIP_TONE_CLASSES: Record<ChipTone, string> = {
  neutral: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700",
  info: "bg-blue-50 text-blue-600 hover:bg-blue-100",
  accent: "bg-point3/60 text-point2 hover:bg-point3",
}

const TONE_ORDER: ChipTone[] = ["accent", "info", "neutral"]

interface WhisperMessage {
  id: string
  relativeLabel: string
  content: ReactNode
  linkHref: string
  linkLabel: string
  tone: ChipTone
  /** 이동 대상 타임라인 섹션의 앵커 id(슬롯 키). 같은 페이지에 있을 때 스크롤로만 이동시키는 데 쓴다. */
  anchorId: string
}

interface WhisperGroup {
  id: string
  dividerLabel: string
  messages: WhisperMessage[]
}

// 코스피 "단물 섹터"(시가총액 가중 등락률 1위)는 정규장 시간대 슬롯에만 붙인다 - 07:30/08:30/
// 17:30/20:00은 정규장 밖이라 업종 지수 자체가 없다(timeline 도메인과 같은 전제). 장 마감(15:30)
// 슬롯을 마지막으로 더 나오지 않으므로, 자연스럽게 "장 마감 후에는 안 바뀐다"가 된다
const TRADING_SECTOR_SLOTS = new Set(["09:30", "12:00", "14:00", "15:30"])

/** 히트맵 1위 섹터를 채팅 말풍선 문구로 바꾼다 */
function topSectorMessage(topSector: NonNullable<HeatmapResponse["top_sector"]>): ReactNode {
  return (
    <>
      지금 개미들이 가장 많이 몰린 단물 섹터는 <strong>{topSector.name}</strong>이에요!
    </>
  )
}

/** 슬롯 하나(제목·부제)를 채팅 말풍선 1~2개로 변환한다. 부제가 있으면 헤드라인 바로 다음 말풍선으로 이어붙인다.
 * 정규장 시간대 슬롯이면 그 시점의 단물 섹터 말풍선도 이어붙인다. */
function slotToGroup(
  slot: ApiTimelineSlot,
  index: number,
  topSector: HeatmapResponse["top_sector"] | null
): WhisperGroup | null {
  if (!slot.briefing_headline) return null

  const tone = TONE_ORDER[index % TONE_ORDER.length]
  const linkHref = `/timeline#${slot.slot_key}`
  const messages: WhisperMessage[] = [
    {
      id: `${slot.slot_key}-headline`,
      relativeLabel: slot.time_slot,
      tone,
      linkHref,
      anchorId: slot.slot_key,
      linkLabel: `${slot.title} 자세히 보기`,
      content: <>{slot.briefing_headline}</>,
    },
  ]

  if (slot.briefing_subtitle) {
    messages.push({
      id: `${slot.slot_key}-subtitle`,
      relativeLabel: slot.time_slot,
      tone,
      linkHref,
      anchorId: slot.slot_key,
      linkLabel: `${slot.title} 자세히 보기`,
      content: <>{slot.briefing_subtitle}</>,
    })
  }

  if (topSector && TRADING_SECTOR_SLOTS.has(slot.time_slot)) {
    messages.push({
      id: `${slot.slot_key}-top-sector`,
      relativeLabel: slot.time_slot,
      tone,
      linkHref: "/heatmap",
      anchorId: slot.slot_key,
      linkLabel: "섹터별 히트맵 보러가기",
      content: topSectorMessage(topSector),
    })
  }

  return {
    id: slot.slot_key,
    dividerLabel: `오늘 ${slot.time_slot}`,
    messages,
  }
}

function useTodayTimeline() {
  const [slots, setSlots] = useState<ApiTimelineSlot[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  // 가장 최근 요청 번호 - 언마운트 후 도착한 응답이나, 늦게 도착한 이전 응답이
  // 최신 데이터를 덮어쓰지 않도록 번호가 다르면 버린다
  const requestIdRef = useRef(0)

  const fetchTimeline = useCallback(async () => {
    const requestId = ++requestIdRef.current
    try {
      const data = await getTimelineDay()
      if (requestId !== requestIdRef.current) return
      setSlots(data)
      setLoadError(false)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error("[getTimelineDay] 실패", error)
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    fetchTimeline()
    const timer = setInterval(fetchTimeline, 60_000)
    return () => {
      requestIdRef.current += 1
      clearInterval(timer)
    }
  }, [fetchTimeline])

  return { slots, loadError }
}

/** 코스피 "단물 섹터"(1위 업종). 말풍선 개수가 흔들리지 않도록 첫 진입 시 한 번은 항상 불러오고,
 * 이후 60초 주기 갱신은 챗이 열려 있을 때만 한다(닫혀 있을 땐 화면에 안 보이므로 모든 페이지에서
 * 계속 폴링할 이유가 없다). 열 때 바로 한 번 갱신해 최신 값을 보여주고, 장 마감(15:30) 이후로는
 * 값이 더 바뀌지 않으므로 주기 갱신을 하지 않는다 */
function useTodayHeatmapTopSector(isOpen: boolean) {
  const [topSector, setTopSector] = useState<HeatmapResponse["top_sector"] | null>(null)
  // 진행 중인 요청 하나만 들고 있다가, 다음 요청이나 언마운트 때 취소한다
  const controllerRef = useRef<AbortController | null>(null)

  const fetchTopSector = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    getHeatmap("kospi", "day", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setTopSector(data.top_sector)
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.error("[getHeatmap] 실패", error)
      })
  }, [])

  // 첫 진입 시 1회
  useEffect(() => {
    fetchTopSector()
    return () => controllerRef.current?.abort()
  }, [fetchTopSector])

  // 챗이 열려 있는 동안만: 열 때 즉시 1회 + 60초마다
  useEffect(() => {
    if (!isOpen) return
    const refresh = () => {
      if (!isAfterMarketClose()) fetchTopSector()
    }
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [isOpen, fetchTopSector])

  return topSector
}

const CALENDAR_REVEAL_HOUR = 9

/** 오늘의 비축 캘린더 일정 - 오전 9시가 되면(또는 이미 지났으면 바로) 채팅에 한 번 안내한다 */
function useTodayCalendarBriefing() {
  const [events, setEvents] = useState<NewsItem[] | null>(null)
  const [revealed, setRevealed] = useState(() => new Date().getHours() >= CALENDAR_REVEAL_HOUR)

  useEffect(() => {
    if (revealed) return
    const msUntilReveal =
      new Date(new Date().setHours(CALENDAR_REVEAL_HOUR, 0, 0, 0)).getTime() - Date.now()
    const timer = window.setTimeout(() => setRevealed(true), Math.max(0, msUntilReveal))
    return () => window.clearTimeout(timer)
  }, [revealed])

  useEffect(() => {
    const today = new Date()
    getCalendarEvents(today.getFullYear(), today.getMonth() + 1)
      .then((dtos) => {
        const todayEvents = dtos
          .map(toNewsItem)
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .filter((item) => isSameDay(item.publishedAt, today))
          .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
        setEvents(todayEvents)
      })
      .catch((error) => {
        console.error("[getCalendarEvents] 실패", error)
        setEvents([])
      })
  }, [])

  return { events, revealed }
}

/** 오늘의 캘린더 일정을 채팅 그룹 하나로 만든다. 아직 안 불러왔으면(events===null) null */
function calendarToGroup(events: NewsItem[] | null): WhisperGroup | null {
  if (events === null) return null

  const content: ReactNode =
    events.length === 0 ? (
      "오늘은 예정된 주요 일정이 없어요."
    ) : (
      <>
        오늘은{" "}
        <strong>
          {events
            .slice(0, 3)
            .map((event) => event.title)
            .join(", ")}
          {events.length > 3 ? ` 외 ${events.length - 3}건` : ""}
        </strong>{" "}
        행사가 예정되어 있어요. 미리 챙겨보세요!
      </>
    )

  return {
    id: "calendar-0900",
    dividerLabel: "오늘 09:00",
    messages: [
      {
        id: "calendar-0900-briefing",
        relativeLabel: "09:00",
        tone: "info",
        linkHref: "/calendar",
        anchorId: "calendar-0900",
        linkLabel: "이벤트 일정 보러가기",
        content,
      },
    ],
  }
}

const WHISPER_REVEAL_INTERVAL_MS = 450

function useSequentialReveal(count: number) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    setVisibleCount(0)
    const timers = Array.from({ length: count }, (_, index) =>
      window.setTimeout(
        () => setVisibleCount((prev) => Math.max(prev, index + 1)),
        index * WHISPER_REVEAL_INTERVAL_MS
      )
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [count])

  return visibleCount
}

// 안 읽은 메시지 배지용 - 마지막으로 챗을 연 시점까지 본 메시지 개수를 저장해둔다.
// 브라우저(이 기기)에만 저장되고 로그인 여부와는 무관하다.
const SEEN_COUNT_STORAGE_KEY = "gaemigul:whisper-chat:seen-count"

/** 열려 있으면 항상 0, 닫혀 있으면 마지막으로 본 이후 새로 쌓인 메시지 수를 배지로 보여준다 */
function useUnreadWhisperCount(totalMessages: number, hasLoaded: boolean, isOpen: boolean) {
  const [seenCount, setSeenCount] = useState(0)
  const baselineReadyRef = useRef(false)

  // 데이터가 처음 로드된 시점에 기준값을 한 번만 정한다. 저장된 값이 있으면 그대로 쓰고,
  // 아예 처음 방문이면(저장된 값 없음) 지금까지의 메시지는 이미 본 것으로 쳐서 배지를 띄우지 않는다 -
  // 이때 정한 기준값은 바로 저장해둬서, 챗을 한 번도 열지 않고 다시 방문해도 그 사이 새로 쌓인
  // 메시지만 배지로 잡힌다
  useEffect(() => {
    if (!hasLoaded || baselineReadyRef.current) return
    baselineReadyRef.current = true

    try {
      const stored = window.localStorage.getItem(SEEN_COUNT_STORAGE_KEY)
      const initial = stored !== null ? Number(stored) : totalMessages
      setSeenCount(initial)
      if (stored === null) {
        window.localStorage.setItem(SEEN_COUNT_STORAGE_KEY, String(initial))
      }
    } catch {
      setSeenCount(totalMessages)
    }
  }, [hasLoaded, totalMessages])

  // 챗을 열면 지금까지의 메시지를 전부 읽은 것으로 기록
  useEffect(() => {
    if (!isOpen || !baselineReadyRef.current) return
    setSeenCount((prev) => {
      if (prev === totalMessages) return prev
      try {
        window.localStorage.setItem(SEEN_COUNT_STORAGE_KEY, String(totalMessages))
      } catch {
        // 저장 실패해도(프라이빗 모드 등) 배지 동작 자체는 이번 세션 동안 정상 동작
      }
      return totalMessages
    })
  }, [isOpen, totalMessages])

  return Math.max(0, totalMessages - seenCount)
}

const PROMOTION_POLL_INTERVAL_MS = 60_000

/** 활동 기반 승급 제안 - 로그인했을 때만 조회한다. 브리핑 메시지와는 별개 시스템이라
 * 안 읽음 배지(useUnreadWhisperCount)와 개수를 합치지 않고 독립적으로 다룬다 */
function usePromotionSuggestion(enabled: boolean) {
  const [suggestion, setSuggestion] = useState<PromotionSuggestion | null>(null)
  // 가장 최근 요청 번호 - 응답이 왔을 때 이 값과 다르면(로그아웃·언마운트·더 최근 요청) 버린다.
  // 로그아웃 직전에 보낸 요청의 응답이 뒤늦게 도착해 승급 카드가 다시 뜨는 걸 막는다
  const requestIdRef = useRef(0)

  const fetchSuggestion = useCallback(() => {
    const requestId = ++requestIdRef.current
    if (!enabled) {
      setSuggestion(null)
      return
    }
    getPromotionSuggestion()
      .then((data) => {
        if (requestId === requestIdRef.current) setSuggestion(data)
      })
      .catch((error) => {
        if (requestId === requestIdRef.current) {
          console.error("[getPromotionSuggestion] 실패", error)
        }
      })
  }, [enabled])

  useEffect(() => {
    fetchSuggestion()
    // 비로그인 상태에서는 조회할 게 없으므로 주기 조회 타이머를 걸지 않는다
    const timer = enabled
      ? setInterval(fetchSuggestion, PROMOTION_POLL_INTERVAL_MS)
      : undefined
    return () => {
      requestIdRef.current += 1
      clearInterval(timer)
    }
  }, [enabled, fetchSuggestion])

  return { suggestion, refetch: fetchSuggestion }
}

/** 챗 맨 위에 고정으로 보여주는 승급 제안 카드 - 브리핑 말풍선과 달리 항상 즉시 노출되고
 * 애니메이션 순서/안읽음 카운트에 끼지 않는다 */
function PromotionSuggestionCard({
  suggestion,
  onRespond,
  responding,
}: {
  suggestion: PromotionSuggestion
  onRespond: (accept: boolean) => void
  responding: boolean
}) {
  return (
    <div className="flex gap-2">
      <div className="w-9 shrink-0">
        <div className="relative size-9 overflow-hidden rounded-full">
          <Image src="/images/profile.png" alt="불개미 대장" fill className="object-cover" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs font-bold text-foreground">불개미 대장</span>
        <div className="flex max-w-[90%] min-w-0 flex-col gap-2.5 rounded-2xl rounded-tl-xs border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
          <p className="flex items-center gap-1 text-xs font-bold text-emerald-700">
            <Sparkles className="size-3.5" />
            승급 제안
          </p>
          <p className="text-xs leading-relaxed font-medium text-neutral-700">
            출석 {suggestion.attendance_days}일 · 용어 {suggestion.distinct_terms_viewed}개 확인했어요!{" "}
            <strong>{suggestion.suggested_grade}</strong>로 승급하시겠어요?
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              disabled={responding}
              onClick={() => onRespond(true)}
              className="flex-1 bg-emerald-500 text-[11px] text-white hover:bg-emerald-600"
            >
              승급하기
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={responding}
              onClick={() => onRespond(false)}
              className="flex-1 text-[11px]"
            >
              나중에
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimeDivider({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

const TIMELINE_PAGE_PATH = "/timeline"

function MessageBubble({
  message,
  showHeader,
  visible,
  delayMs,
}: {
  message: WhisperMessage
  showHeader: boolean
  visible: boolean
  delayMs: number
}) {
  const router = useRouter()
  const pathname = usePathname()

  const handleClick = (event: React.MouseEvent) => {
    // 이미 타임라인 페이지이고, 링크도 타임라인 섹션을 가리킬 때만 새로 이동하지 않고
    // 해당 섹션으로 바로 스크롤한다(단물 섹터 말풍선처럼 /heatmap으로 가는 링크는 그대로 이동시킨다).
    if (pathname === TIMELINE_PAGE_PATH && message.linkHref.startsWith(`${TIMELINE_PAGE_PATH}#`)) {
      event.preventDefault()
      document.getElementById(message.anchorId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      router.replace(message.linkHref, { scroll: false })
    }
  }

  return (
    <div
      className={`flex gap-2 ${visible ? "animate-chat-in" : "opacity-0"}`}
      style={visible ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      <div className="w-9 shrink-0">
        {showHeader && (
          <div className="relative size-9 overflow-hidden rounded-full">
            <Image
              src="/images/profile.png"
              alt="불개미 대장"
              fill
              className="object-cover"
            />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {showHeader && (
          <span className="text-xs font-bold text-foreground">
            불개미 대장
          </span>
        )}
        <div className="flex items-end gap-2">
          <div
            className={`flex max-w-[85%] min-w-0 flex-col gap-2.5 rounded-2xl bg-card p-3 shadow-sm ${showHeader ? "rounded-tl-xs" : "rounded-tl-lg"}`}
          >
            <p className="text-justify text-xs leading-relaxed font-medium text-card-foreground">
              {message.content}
            </p>
            <Separator className="opacity-50" />
            <Button
              render={<Link href={message.linkHref} />}
              nativeButton={false}
              variant="secondary"
              onClick={handleClick}
              className={`w-fit text-[11px] ${CHIP_TONE_CLASSES[message.tone]}`}
            >
              {message.linkLabel}
              <ArrowRight className="h-3! w-3!" />
            </Button>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {message.relativeLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * "불개미 대장" 챗 - 모든 페이지 우측 하단에 뜨는 플로팅 버튼/패널.
 * 데스크톱·모바일 구분 없이 같은 토글 방식을 쓴다(전에는 데스크톱에서 홈페이지에만 항상 펼쳐진
 * 인라인 패널이었다). 패널은 열릴 때마다 살짝 통통 튀는 느낌의 등장 애니메이션(animate-panel-in,
 * globals.css)을 탄다. 데스크톱에서는 패널이 콘텐츠 위에 그대로 오버레이되지만, 모바일(sm 미만)에서는
 * 패널 뒤 화면을 블러 처리하는 백드롭을 함께 띄운다.
 */
export default function WhisperChat() {
  const [isOpen, setIsOpen] = useState(false)
  // 패널·백드롭을 실제로 DOM에 그릴지 여부 - isOpen이 false로 바뀌어도 바로 떼지 않고,
  // 닫히는 애니메이션(animate-panel-out, globals.css)이 끝날 때까지는 계속 그려서 등장
  // 애니메이션의 역순이 보이게 한다. 애니메이션이 끝나면 handlePanelAnimationEnd에서 내려간다.
  const [isPanelMounted, setIsPanelMounted] = useState(false)

  useEffect(() => {
    if (isOpen) setIsPanelMounted(true)
  }, [isOpen])

  const handlePanelAnimationEnd = () => {
    if (!isOpen) setIsPanelMounted(false)
  }

  // 레이아웃에 붙어 있어 페이지를 옮겨도 언마운트되지 않으므로, 경로가 바뀌면 직접 닫는다.
  // (같은 페이지 안의 해시 이동 - 타임라인 섹션 스크롤 - 은 pathname이 그대로라 닫히지 않는다)
  const pathname = usePathname()
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setIsOpen(false)
  }

  const { slots, loadError } = useTodayTimeline()
  const topSector = useTodayHeatmapTopSector(isOpen)
  const { events: calendarEvents, revealed: calendarRevealed } = useTodayCalendarBriefing()
  const { status: authStatus, refresh: refreshAuth } = useAuth()
  const { suggestion, refetch: refetchSuggestion } = usePromotionSuggestion(authStatus === "authenticated")
  const [respondingSuggestion, setRespondingSuggestion] = useState(false)

  const handleRespondSuggestion = async (accept: boolean) => {
    if (!suggestion) return
    setRespondingSuggestion(true)
    try {
      await respondToPromotionSuggestion(suggestion.id, accept)
      if (accept) await refreshAuth() // 헤더 등급 배지도 바로 갱신
      await refetchSuggestion()
    } catch (error) {
      console.error("[respondToPromotionSuggestion] 실패", error)
    } finally {
      setRespondingSuggestion(false)
    }
  }

  const slotGroups: WhisperGroup[] =
    slots
      ?.map((slot, index) => slotToGroup(slot, index, topSector))
      .filter((group): group is WhisperGroup => group !== null) ?? []

  // 09:00 캘린더 안내는 시간순으로 맞는 자리(08:30 슬롯과 09:30 슬롯 사이)에 끼워 넣는다.
  // "HH:MM" 형식이라 문자열 비교로도 시간 순서가 맞는다
  const calendarGroup = calendarRevealed ? calendarToGroup(calendarEvents) : null
  const groups: WhisperGroup[] = calendarGroup
    ? [
        ...slotGroups.filter((group) => group.id < "0900"),
        calendarGroup,
        ...slotGroups.filter((group) => group.id >= "0900"),
      ]
    : slotGroups

  const totalMessages = groups.reduce(
    (sum, group) => sum + group.messages.length,
    0
  )
  const unreadCount = useUnreadWhisperCount(totalMessages, slots !== null, isOpen)
  const visibleCount = useSequentialReveal(totalMessages)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 하단 근처에 있을 때만 자동 스크롤을 이어간다. 애니메이션 도중 유저가 위로 스크롤하면
  // 다음 말풍선이 나와도 강제로 하단까지 끌려가지 않게 하기 위함.
  const shouldAutoScrollRef = useRef(true)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight
      shouldAutoScrollRef.current = distanceFromBottom < 40
    }

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container || !shouldAutoScrollRef.current) return
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
  }, [visibleCount])

  let renderedCount = 0

  return (
    <>
      {/* 모바일 전용 백드롭 블러 - 패널이 마운트돼 있는 동안(열려 있거나, 닫히는 애니메이션 중)만,
          sm 이상에서는 띄우지 않는다. isOpen이 아니면 닫히는 중이므로 클릭을 가로채지 않게 한다. */}
      {isPanelMounted && (
        <div
          aria-hidden
          onClick={() => setIsOpen(false)}
          className={cn(
            "fixed inset-0 z-40 bg-black/40 sm:hidden",
            isOpen ? "animate-backdrop-in" : "animate-backdrop-out pointer-events-none"
          )}
        />
      )}

      <div
        onAnimationEnd={handlePanelAnimationEnd}
        className={cn(
          // 토글 버튼(bottom-20, 56px) 바로 위에 뜬다. 화면이 낮으면 위로 넘치지 않게 높이를 줄인다
          "fixed inset-x-4 bottom-38 z-50 flex h-[min(70vh,calc(100svh-12rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:inset-x-auto sm:right-4 sm:w-96",
          isOpen ? "animate-panel-in" : "animate-panel-out",
          !isPanelMounted && "hidden"
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3.5">
          <div className="flex w-full items-center gap-2">
            <div className="relative size-9 shrink-0">
              <Image
                src="/images/profile.png"
                alt="불개미 대장"
                fill
                className="rounded-full object-cover"
              />
              <span className="absolute -right-px -bottom-0.5 size-3 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className="flex w-full flex-col">
              <div className="flex flex-wrap items-center justify-between">
                <span className="text-sm font-bold text-card-foreground">불개미 대장</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-point/10 px-2 py-0.5 text-[10px] font-medium text-point">
                  <span className="size-1.5 rounded-full bg-point" />
                  실시간 브리핑 중
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                장중 핵심 시그널 귓속말 피드
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="대장 챗 닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-muted px-4 py-5"
        >
          {suggestion && (
            <PromotionSuggestionCard
              suggestion={suggestion}
              onRespond={handleRespondSuggestion}
              responding={respondingSuggestion}
            />
          )}

          {slots === null && !loadError ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="mx-auto h-5 w-24 rounded-full" />
              <div className="flex gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <Skeleton className="h-16 w-2/3 rounded-2xl" />
              </div>
              <div className="flex gap-3">
                <div className="w-9 shrink-0" />
                <Skeleton className="h-12 w-1/2 rounded-2xl" />
              </div>
            </div>
          ) : loadError && groups.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              브리핑을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              아직 브리핑이 준비되지 않았어요. 07:30에 첫 소식을 전해드릴게요!
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-4">
                <TimeDivider label={group.dividerLabel} />
                {group.messages.map((message, index) => {
                  // 맨 마지막(가장 최근) 말풍선부터 fadeUp되도록 노출 순서를 뒤집는다.
                  const order = totalMessages - 1 - renderedCount
                  renderedCount += 1
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      showHeader={index === 0}
                      visible={visibleCount > order}
                      delayMs={0}
                    />
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 모든 페이지 우측 하단 플로팅 토글 버튼 - 데스크톱·모바일 공통.
          바로 아래(bottom-4)에 같은 크기의 ScrollTopButton이 있어 그 위(bottom-4 + 56px + 간격 8px)에 둔다.
          모바일(sm 미만)에서는 50px, 그 이상에서는 56px. */}
      <button
        type="button"
        onClick={() => {
          if (!isOpen) trackEvent("whisper_chat_open")
          setIsOpen(!isOpen)
        }}
        aria-label={isOpen ? "대장 챗 닫기" : "대장 챗 열기"}
        className="cursor-pointer fixed right-3 bottom-20 z-50 flex size-[50px] items-center justify-center rounded-full bg-point text-white shadow-lg transition-transform active:scale-95 sm:size-14"
      >
        {isOpen ? (
          <X size={24} />
        ) : (
          <>
            <MessageCircle size={24} />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : (
              <span className="absolute top-0 right-0 size-3 rounded-full border-2 border-white bg-emerald-500" />
            )}
            {/* 승급 제안 대기 중 표시 - 안읽음 배지와 다른 자리(좌상단)에 별도 표시해서 서로 안 겹친다 */}
            {suggestion && (
              <span className="absolute -top-1 -left-1 flex size-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
                <Sparkles className="size-2.5" />
              </span>
            )}
          </>
        )}
      </button>
    </>
  )
}
