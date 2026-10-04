"use client"

import { Search, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"

import { LoginRequiredDialog, PageTitle, useAuth } from "@/components/common"
import { Skeleton } from "@/components/ui"
import { GlossaryCategoryTabs } from "@/components/glossary/GlossaryCategoryTabs"
import {
  GlossaryTermCard,
  GlossaryTermCardSkeleton,
} from "@/components/glossary/GlossaryTermCard"
import { GlossaryToneTabs } from "@/components/glossary/GlossaryToneTabs"
import {
  getGlossaryFavorites,
  getGlossaryTerms,
  toggleGlossaryFavorite,
} from "@/lib/api/glossary"
import {
  categoryInfo,
  groupTermsByCategory,
  matchesQuery,
  toneForGrade,
  type CategoryFilter,
  type ToneFilter,
} from "@/lib/glossary"
import type { ApiGlossaryTerm } from "@/lib/types/GlossaryType"
import { SECTION_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

function GlossaryPageContent() {
  // 다른 화면(홈 "오늘의 한 입" 등)에서 /glossary?q=용어 로 넘어오면 그 용어로 검색된 상태로 연다
  const searchParams = useSearchParams()
  const queryParam = searchParams.get("q") ?? ""
  const [terms, setTerms] = useState<ApiGlossaryTerm[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [tone, setTone] = useState<ToneFilter>("all")
  const [category, setCategory] = useState<CategoryFilter>("all")
  const [query, setQuery] = useState(queryParam)
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const closeLoginDialog = useCallback(() => setLoginDialogOpen(false), [])
  const searchId = useId()
  const { status: authStatus, user } = useAuth()
  const trackView = authStatus === "authenticated"

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setFavoriteIds(new Set())
      return
    }
    getGlossaryFavorites()
      .then((favorites) =>
        setFavoriteIds(new Set(favorites.map((term) => term.id)))
      )
      .catch((error) => console.error("[getGlossaryFavorites] 실패", error))
  }, [authStatus])

  const handleToggleFavorite = async (termId: number) => {
    // 비로그인이면 로그인 안내 팝업. 로그인 여부를 아직 확인 중이면(loading) 잘못된 안내를 막으려고 무시한다
    if (authStatus !== "authenticated") {
      if (authStatus === "unauthenticated") setLoginDialogOpen(true)
      return
    }
    // 낙관적 업데이트 - 실패하면 되돌린다
    const wasFavorited = favoriteIds.has(termId)
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      if (wasFavorited) next.delete(termId)
      else next.add(termId)
      return next
    })
    try {
      await toggleGlossaryFavorite(termId)
    } catch (error) {
      console.error("[toggleGlossaryFavorite] 실패", error)
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        if (wasFavorited) next.add(termId)
        else next.delete(termId)
        return next
      })
    }
  }

  // 로그인한 유저는 첫 진입 시 본인 등급에 맞는 톤을 기본값으로 - 그 뒤 직접 바꾸면 더 이상 덮어쓰지 않는다
  const toneDefaultedRef = useRef(false)
  useEffect(() => {
    if (toneDefaultedRef.current || authStatus === "loading") return
    toneDefaultedRef.current = true
    if (authStatus === "authenticated" && user)
      setTone(toneForGrade(user.grade))
  }, [authStatus, user])

  useEffect(() => {
    let cancelled = false

    getGlossaryTerms()
      .then((data) => {
        if (!cancelled) setTerms(data)
      })
      .catch((error) => {
        console.error("[getGlossaryTerms] 실패", error)
        if (!cancelled) setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // 이미 용어 사전을 보고 있을 때 다른 q로 다시 들어와도 검색어를 맞춘다(렌더 중 조정 - effect 불필요)
  const [prevQueryParam, setPrevQueryParam] = useState(queryParam)
  if (queryParam !== prevQueryParam) {
    setPrevQueryParam(queryParam)
    setQuery(queryParam)
    setCategory("all")
  }

  // 연관 태그는 다른 카테고리의 용어일 수 있어서, 태그로 검색할 땐 카테고리를 "전체"로 되돌린다
  const handleTagClick = (relatedTerm: string) => {
    setCategory("all")
    setQuery(relatedTerm)
  }

  // "전체"면 카테고리별 그룹을 순서대로, 카테고리를 고르면 그 그룹 하나만 (검색어는 그룹 안에서 적용)
  const groups = useMemo(
    () =>
      groupTermsByCategory(
        (terms ?? []).filter((term) => matchesQuery(term, query)),
        category
      ),
    [terms, category, query]
  )

  // 카테고리를 골랐는데 검색 결과가 없어도 그 카테고리의 타이틀·설명은 보여준다
  const selectedInfo = categoryInfo(category)
  const emptyMessage = query
    ? `“${query}”에 해당하는 용어가 없어요.`
    : "이 카테고리에 해당하는 용어가 아직 없어요."

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full flex-col gap-6">
        <PageTitle
          title="개미들을 위한 주식&경제 용어 사전"
          description="난이도에 맞는 톤으로 투자 용어를 익혀보세요."
        />

        <section
          className={cn(
            SECTION_CARD,
            "flex h-max min-w-0 flex-1 flex-col gap-4"
          )}
        >
          {/* 검색창은 맨 위에 전체 너비로 크게 두고, 스크롤해도 헤더 바로 아래에 붙어 있게 한다.
              카드 좌우 여백까지 배경으로 덮어서 아래로 지나가는 카드가 비쳐 보이지 않게 한다 */}
          <div
            className="sticky z-20 -mx-4 bg-card px-4 py-2 sm:-mx-5 sm:px-5"
            style={{ top: "var(--header-height, 75px)" }}
          >
            <div className="relative w-full">
              <Search
                className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <label className="sr-only" htmlFor={searchId}>
                용어 검색
              </label>
              <input
                id={searchId}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("")
                }}
                placeholder="궁금한 용어를 검색해 보세요 (예: PER, 공매도)"
                autoComplete="off"
                className="h-12 w-full rounded-xl border bg-background pr-4 pl-12 text-base outline-offset-2 placeholder:text-muted-foreground focus-visible:outline-point max-md:h-11 max-md:text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                  className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <GlossaryToneTabs value={tone} onChange={setTone} />
            <p className="text-[11px] text-muted-foreground">
              버튼을 누르면 용어는 그대로, 설명이 내 눈높이에 맞게 바뀌어요.
            </p>
          </div>

          <GlossaryCategoryTabs value={category} onChange={setCategory} />

          {terms === null && !loadError ? (
            // 그룹 제목 + 용어 카드 그리드와 같은 모양의 뼈대
            <div
              role="status"
              aria-label="용어 사전 불러오는 중"
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5 border-b pb-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3.5 w-64 max-w-full" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 9 }, (_, index) => (
                  <GlossaryTermCardSkeleton key={index} />
                ))}
              </div>
            </div>
          ) : loadError && (terms ?? []).length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              용어 사전을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          ) : groups.length === 0 ? (
            <div className="flex flex-col gap-4">
              {selectedInfo && (
                <GlossaryGroupHeader
                  title={selectedInfo.title}
                  subtitle={selectedInfo.subtitle}
                  count={0}
                />
              )}
              <p className="py-12 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {groups.map((group) => (
                <section
                  key={group.key}
                  aria-labelledby={`glossary-group-${group.key}`}
                  className="flex flex-col gap-3"
                >
                  <GlossaryGroupHeader
                    id={`glossary-group-${group.key}`}
                    title={group.title}
                    subtitle={group.subtitle}
                    count={group.terms.length}
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.terms.map((term) => (
                      <GlossaryTermCard
                        key={term.id}
                        term={term}
                        tone={tone}
                        onTagClick={handleTagClick}
                        trackView={trackView}
                        favorited={favoriteIds.has(term.id)}
                        onToggleFavorite={() => handleToggleFavorite(term.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>

      <LoginRequiredDialog open={loginDialogOpen} onClose={closeLoginDialog} />
    </div>
  )
}

/** 카테고리 그룹 머리글 - 타이틀 + 어떤 용어들인지 한 줄 설명 */
function GlossaryGroupHeader({
  id,
  title,
  subtitle,
  count,
}: {
  id?: string
  title: string
  subtitle: string
  /** 이 그룹에 보이는 용어 수 (검색 중이면 검색에 걸린 수) */
  count: number
}) {
  return (
    <div className="flex flex-col gap-1 border-b pb-2">
      <h2 id={id} className="flex items-baseline gap-2 text-base font-bold">
        {title}
        <span className="text-xs font-medium text-point">{count}개</span>
      </h2>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}

export default function GlossaryPage() {
  return (
    <Suspense fallback={null}>
      <GlossaryPageContent />
    </Suspense>
  )
}
