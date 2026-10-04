"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/common"
import { Badge, Button, Skeleton } from "@/components/ui"
import { getGlossaryTerms } from "@/lib/api/glossary"
import { SECTION_CARD } from "@/lib/constant/surface"
import { descriptionForTone, toneForGrade } from "@/lib/glossary"
import type { ApiGlossaryTerm } from "@/lib/types/GlossaryType"
import { cn } from "@/lib/utils"

/** 용어 사전에서 오늘의 한 입으로 보여줄 항목 하나를 날짜 기준으로 고정 선택한다.
 * 목록 순서가 바뀌어도 같은 날엔 같은 용어가 나오도록 id 순으로 정렬한 뒤 고른다. */
function pickDailyTerm(terms: ApiGlossaryTerm[]): ApiGlossaryTerm | null {
  if (terms.length === 0) return null

  const sorted = [...terms].sort((a, b) => a.id - b.id)
  const dayIndex = Math.floor(Date.now() / 86_400_000)
  return sorted[dayIndex % sorted.length]
}

// "개미 용어 사전"(GET /glossary/terms, glossary_term 테이블) 데이터를 쓴다. 예전에 쓰던
// GET /timeline/glossary(백엔드 하드코딩 GLOSSARY)는 레거시로 남겨 두고 여기서는 부르지 않는다
export default function TodayAntTermCard() {
  const { user } = useAuth()
  const [antTerm, setAntTerm] = useState<ApiGlossaryTerm | null>(null)
  // 응답이 오기 전엔 스켈레톤, 응답이 왔는데 용어가 없거나 실패하면 카드를 숨긴다
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    getGlossaryTerms()
      .then((terms) => {
        if (!cancelled) setAntTerm(pickDailyTerm(terms))
      })
      .catch((error) => {
        console.error("[getGlossaryTerms] 실패", error)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // 용어 사전 페이지와 같은 기준 - 비로그인은 청년 개미(mid) 톤, 로그인하면 본인 등급 톤
  const description = useMemo(() => {
    if (!antTerm) return ""
    return descriptionForTone(antTerm, user ? toneForGrade(user.grade) : "mid")
  }, [antTerm, user])

  if (!loaded) return <TodayAntTermCardSkeleton />
  if (!antTerm) return null

  return (
    <div className={cn(SECTION_CARD, "flex h-full w-full flex-col gap-4")}>
      <div className="flex h-full min-w-0 flex-col justify-between gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-point text-[11px] text-white">
            오늘의 한 입
          </Badge>
          <span className="text-sm font-bold text-foreground">
            오늘의 개미 용어 한 입
          </span>
          {/* 모바일에서는 용어를 다음 줄로 내리고 한 단계 작게 - PC(md 이상)는 그대로 */}
          <strong className="text-2xl max-md:basis-full max-md:text-xl">
            {antTerm.term}
          </strong>
          <p className="text-xs text-muted-foreground">
            &ldquo;{description}&rdquo;
          </p>
        </div>
        {/* '오늘의 이벤트 일정'의 '전체 보기'와 같은 버튼 스타일 */}
        <Button
          render={
            <Link href={`/glossary?q=${encodeURIComponent(antTerm.term)}`} />
          }
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="mt-1 w-fit self-start text-neutral-400"
        >
          용어 사전에서 자세히 보기
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}

/** 오늘의 한 입을 불러오는 동안 같은 자리를 차지하는 뼈대 (배지·제목 / 설명 2줄 / 링크) */
function TodayAntTermCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="오늘의 한 입 불러오는 중"
      className={cn(SECTION_CARD, "flex h-full w-full flex-col gap-2")}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-2/3" />
      <Skeleton className="mt-1 h-3 w-28" />
    </div>
  )
}
