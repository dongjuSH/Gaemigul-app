"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  format,
  isAfter,
  isBefore,
  isSameDay,
  isValid,
  isWeekend,
  parse,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns"

import { PageTitle, useAuth } from "@/components/common"
import TimelineSkeleton from "@/components/timeline/TimelineSkeleton"
import { useTimelineSchedule } from "@/components/common/timeline"
import {
  TimelineDateHeader,
  TimelineSection,
  TimelineSectionsNav,
} from "@/components/timeline"
import { getGlossaryTerms } from "@/lib/api/glossary"
import { getTimelineAvailableDates, getTimelineDay } from "@/lib/api/timeline"
import { descriptionForTone, toneForGrade } from "@/lib/glossary"
import { mapSlotToContent } from "@/lib/timeline-mapper"
import type { ApiGlossaryTerm } from "@/lib/types/GlossaryType"
import type { ApiTimelineSlot } from "@/lib/types/TimelineType"

const TODAY = startOfDay(new Date())
// 백엔드가 실데이터를 쌓기 시작한 날짜. 이전 날짜는 캘린더에서 선택할 수 없다.
const MIN_DATE = startOfDay(new Date(2026, 8, 14))
// 오늘은 새 슬롯이 계속 쌓이므로 이 주기로 다시 불러온다.
const REFRESH_INTERVAL_MS = 60_000
const DATE_KEY_FORMAT = "yyyy-MM-dd"

const toDateKey = (date: Date) => format(date, DATE_KEY_FORMAT)

/** ?date= 값을 날짜로 바꾼다. 형식이 틀렸거나(2026-02-31 포함) 조회 범위 밖이면 null */
function parseDateKey(value: string): Date | null {
  const parsed = parse(value, DATE_KEY_FORMAT, TODAY)
  if (!isValid(parsed) || toDateKey(parsed) !== value) return null
  if (isBefore(parsed, MIN_DATE) || isAfter(parsed, TODAY)) return null
  return startOfDay(parsed)
}

/** 실제 데이터가 있는 가장 최근 날짜. 이번 달에 없으면 MIN_DATE가 있는 달까지 한 달씩 거슬러 올라간다 */
async function findLatestDataDateKey(): Promise<string | null> {
  const todayKey = toDateKey(TODAY)
  const minKey = toDateKey(MIN_DATE)

  for (
    let month = startOfMonth(TODAY);
    !isBefore(month, startOfMonth(MIN_DATE));
    month = subMonths(month, 1)
  ) {
    const dates = await getTimelineAvailableDates(
      month.getFullYear(),
      month.getMonth() + 1
    )
    const latest = dates
      .filter((key) => key >= minKey && key <= todayKey)
      .sort()
      .at(-1)
    if (latest) return latest
  }
  return null
}

type LoadState = "loading" | "ready" | "error" | "empty"

function TimelinePageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { items } = useTimelineSchedule(30000)
  const { status: authStatus, user } = useAuth()

  // 선택 날짜는 URL(?date=YYYY-MM-DD)이 기준이다. 없으면 오늘. 다른 화면에서 날짜를 지정해
  // 넘어올 수 있고, 데이터가 없는 날짜면 아래에서 가장 최근 데이터 날짜로 바꿔 준다
  const dateParam = searchParams.get("date")
  const parsedParam = dateParam === null ? TODAY : parseDateKey(dateParam)
  const isInvalidParam = parsedParam === null
  const selectedDate = parsedParam ?? TODAY
  const selectedKey = toDateKey(selectedDate)
  const isViewingToday = isSameDay(selectedDate, TODAY)
  // 평일 "오늘"은 슬롯이 아직 하나도 없어도(07:30 전) 다른 날짜로 보내지 않고 시간대별 잠금 목록을 보여준다
  const keepEmptyToday = isViewingToday && !isWeekend(TODAY)
  // "굴 파기 기록"은 로그인 상태로 "오늘" 날짜를 보고 있을 때만 카운트 대상이다 - 지난 날짜를
  // 훑어보는 건 실시간 진입이 아니라서 제외한다(요구사항 문서 4번)
  const trackVisit = isViewingToday && authStatus === "authenticated"

  // 결과는 어떤 요청(날짜)에 대한 것인지와 함께 저장한다. URL의 날짜가 바뀌면 key가 달라져
  // 자동으로 "loading"이 된다 - 새 날짜로 옮겨 가는 동안에도 따로 상태를 초기화할 필요가 없다
  const requestKey = isInvalidParam ? `invalid:${dateParam}` : selectedKey
  const [slots, setSlots] = useState<ApiTimelineSlot[]>([])
  const [result, setResult] = useState<{
    key: string
    state: LoadState
  } | null>(null)
  const loadState: LoadState =
    result?.key === requestKey ? result.state : "loading"
  const [glossaryTerms, setGlossaryTerms] = useState<ApiGlossaryTerm[]>([])

  const goToDate = useCallback(
    (key: string) => {
      const query = key === toDateKey(TODAY) ? "" : `?date=${key}`
      // /timeline#슬롯키 로 들어왔다가 날짜가 바뀌어도 해시 스크롤 대상은 유지한다
      router.replace(`${pathname}${query}${window.location.hash}`, {
        scroll: false,
      })
    },
    [pathname, router]
  )

  useEffect(() => {
    getGlossaryTerms()
      .then(setGlossaryTerms)
      .catch(() => setGlossaryTerms([]))
  }, [])

  // 본문 용어 호버 설명은 "개미 용어 사전"(glossary_term) 데이터를 쓴다. 로그인 안 했으면
  // 청년 개미(mid) 톤, 로그인했으면 본인 등급에 맞는 톤으로 보여준다
  const glossary = useMemo(() => {
    const tone = user ? toneForGrade(user.grade) : "mid"
    return Object.fromEntries(
      glossaryTerms.map((term) => [term.term, descriptionForTone(term, tone)])
    )
  }, [glossaryTerms, user])

  useEffect(() => {
    let cancelled = false

    // 데이터가 없는 날짜로 들어오면 가장 최근 데이터 날짜로 보낸다. 그 날짜도 못 찾을 때만
    // (데이터가 전혀 없거나 조회 실패) 예외 문구를 보여준다
    const redirectToLatest = async () => {
      try {
        const latestKey = await findLatestDataDateKey()
        if (cancelled) return
        if (latestKey && latestKey !== selectedKey) {
          goToDate(latestKey)
          return
        }
      } catch {
        // 아래 예외 문구로 처리
      }
      if (!cancelled) {
        setSlots([])
        setResult({ key: requestKey, state: "empty" })
      }
    }

    if (isInvalidParam) {
      redirectToLatest()
      return () => {
        cancelled = true
      }
    }

    const load = (isInitial: boolean) => {
      getTimelineDay(selectedKey)
        .then((data) => {
          if (cancelled) return
          if (data.length === 0 && !keepEmptyToday) {
            // 자동 갱신 중에 비는 경우(드묾)는 화면을 그대로 두고, 첫 진입일 때만 날짜를 옮긴다
            if (isInitial) redirectToLatest()
            return
          }
          setSlots(data)
          setResult({ key: requestKey, state: "ready" })
        })
        .catch(() => {
          if (cancelled) return
          setSlots([])
          setResult({ key: requestKey, state: "error" })
        })
    }

    load(true)

    const timer = isViewingToday
      ? setInterval(() => load(false), REFRESH_INTERVAL_MS)
      : undefined

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [
    requestKey,
    selectedKey,
    isInvalidParam,
    isViewingToday,
    keepEmptyToday,
    goToDate,
  ])

  const slotByKey = useMemo(() => {
    const map = new Map<string, ApiTimelineSlot>()
    slots.forEach((slot) => map.set(slot.slot_key, slot))
    return map
  }, [slots])

  // 사이드바·대장 챗에서 /timeline#슬롯키로 넘어올 때, Next 라우터의 해시 스크롤은 페이지
  // 진입 직후 한 번만 시도되는데 그 시점엔 슬롯 데이터가 비동기로 아직 로딩 중이라 섹션이
  // DOM에 없어 실패한다. 대상 요소가 나타날 때까지 최대 3초간 짧은 간격으로 재시도한다.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    const id = hash.slice(1)

    let cancelled = false
    let timerId: number | undefined

    const attemptScroll = (retriesLeft: number) => {
      if (cancelled) return
      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
      if (retriesLeft <= 0) return
      timerId = window.setTimeout(() => attemptScroll(retriesLeft - 1), 150)
    }

    attemptScroll(20)

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [])

  return (
    <div className="flex w-full flex-col gap-6">
      <PageTitle
        title="개미들을 위한 실시간 시장 페로몬 신호"
        description="시장의 급박한 변화와 핵심 뉴스 요약을 페로몬 흔적처럼 빠르게 따라갑니다."
        tabsAside={
          <TimelineDateHeader
            selectedDate={selectedDate}
            minDate={MIN_DATE}
            maxDate={TODAY}
            onSelect={(date) => goToDate(toDateKey(date))}
          />
        }
      />

      <TimelineSectionsNav
        items={items}
        sectionsReady={loadState === "ready"}
      />

      {loadState === "loading" && <TimelineSkeleton />}

      {loadState === "error" && (
        <p className="py-10 text-center text-sm text-decrease">
          타임라인 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {/* 예외 전용: 가장 최근 데이터 날짜도 찾지 못했을 때만 보인다 */}
      {loadState === "empty" && (
        <p className="py-10 text-center text-sm text-neutral-400">
          이 날짜에는 데이터가 없어요. 휴장일이거나 아직 수집되지 않았어요.
        </p>
      )}

      {loadState === "ready" && (
        <div className="flex w-full flex-col gap-15">
          {items.map((item) => {
            const slot = slotByKey.get(item.id)
            if (!slot && !isViewingToday) return null

            return (
              <TimelineSection
                key={item.id}
                item={item}
                content={slot ? mapSlotToContent(slot) : null}
                glossary={glossary}
                trackVisit={trackVisit}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function TimelinePage() {
  return (
    <Suspense fallback={<TimelineSkeleton />}>
      <TimelinePageContent />
    </Suspense>
  )
}
