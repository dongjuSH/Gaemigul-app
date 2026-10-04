"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  BriefingArticle,
  BriefingArticleHeader,
  BriefingImage,
  BriefingLede,
  BriefingNoviceSummary,
  BriefingSkeleton,
  ReportSectionsNav,
} from "@/components/briefing"
import { PageTitle } from "@/components/common"
import { ReportSidebarMobileNav } from "@/components/home/reportSidebar/ReportSidebar"
import { getReport, getReportList, type ReportKind } from "@/lib/api/report"
import {
  isReportReady,
  mapReportToBriefingContent,
} from "@/lib/briefing-mapper"
import type { BriefingContent } from "@/lib/types/BriefingType"
import { SECTION_CARD, EMPTY_STATE_BOX } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

type ReportTarget = { type: ReportKind; date: string }

function getCurrentYearMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** 쿼리로 지정된 보고서가 없을 때, 이번 달 목록에서 가장 최근 보고서를 기본값으로 고른다. */
async function resolveDefaultTarget(): Promise<ReportTarget | null> {
  const { year, month } = getCurrentYearMonth()
  const list = await getReportList(year, month)
  const latestWeek = list.weeks[0]
  if (!latestWeek) return null

  if (latestWeek.weekly) {
    return { type: "weekly", date: latestWeek.weekly.end_date }
  }

  const latestDaily = latestWeek.dailies.at(-1)
  return latestDaily ? { type: "daily", date: latestDaily.end_date } : null
}

function BriefingPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryType = searchParams.get("type")
  const queryDate = searchParams.get("date")

  const [content, setContent] = useState<BriefingContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)

  useEffect(() => {
    let cancelled = false
    // URL을 바꾸러 가는 중이면 다음 effect가 불러올 때까지 로딩 표시를 유지한다
    let redirecting = false

    const load = async () => {
      setIsLoading(true)
      setIsEmpty(false)

      const hasQueryTarget = queryType === "daily" || queryType === "weekly"
      const target: ReportTarget | null = hasQueryTarget
        ? { type: queryType, date: queryDate ?? "" }
        : await resolveDefaultTarget()

      // 탭 등으로 쿼리 없이 /briefing에 들어온 경우, 고른 기본 보고서를 URL에 반영한다 - 사이드바는
      // ?type=&date=로 액티브 항목을 판정하므로 이렇게 해야 같이 표시된다. URL이 바뀌면 이 effect가
      // 다시 돌면서 보고서를 불러온다
      if (!hasQueryTarget && target?.date) {
        if (!cancelled) {
          redirecting = true
          router.replace(
            `${pathname}?type=${target.type}&date=${target.date}`,
            {
              scroll: false,
            }
          )
        }
        return
      }

      if (!target || !target.date) {
        if (!cancelled) {
          setContent(null)
          setIsEmpty(true)
        }
        return
      }

      const report = await getReport(target.type, target.date)
      if (cancelled) return

      if (!isReportReady(report)) {
        setContent(null)
        setIsEmpty(true)
        return
      }

      setContent(mapReportToBriefingContent(report))
      setIsEmpty(false)
    }

    load()
      .catch(() => {
        if (cancelled) return
        setContent(null)
        setIsEmpty(true)
      })
      .finally(() => {
        if (!cancelled && !redirecting) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [queryType, queryDate, pathname, router])

  const reportSectionItems = useMemo(
    () =>
      content?.article.map((article) => ({
        id: article.id,
        label: `${article.index} ${article.eyebrow}`,
      })) ?? [],
    [content]
  )

  return (
    <div className="flex">
      <div className="flex w-full flex-col gap-6">
        <PageTitle
          title="개미들을 위한 실시간 시장 페로몬 신호"
          description="시장의 급박한 변화와 핵심 뉴스 요약을 페로몬 흔적처럼 빠르게 따라갑니다."
        />

        <ReportSidebarMobileNav />

        {isLoading && <BriefingSkeleton />}

        {!isLoading && isEmpty && (
          <div className={cn(EMPTY_STATE_BOX, "flex min-h-100 w-full items-center justify-center")}>
            <p className="text-sm text-muted-foreground">
              아직 리포트가 생성되지 않았습니다.
            </p>
          </div>
        )}

        {!isLoading && !isEmpty && content && (
          <div className="flex items-start gap-6">
            <section className={cn(SECTION_CARD, "flex min-w-0 flex-1 flex-col gap-6")}>
              <BriefingArticleHeader content={content} />

              <BriefingImage url={content.mainImageUrl} alt={content.title} />

              <BriefingLede
                lead={content.lead}
                points={content.todayBriefPoints}
                reviewMessage={content.reviewMessage}
              />

              <div className="flex gap-5">
                <div className="flex flex-col gap-5">
                  {content.article.map((article, id) => (
                    <BriefingArticle
                      key={article.id}
                      id={id}
                      article={article}
                      reviewMessage={content.reviewMessage}
                    />
                  ))}

                  <BriefingNoviceSummary
                    summary={content.noviceSummary}
                    glossary={content.glossary}
                  />
                </div>
                <ReportSectionsNav
                  items={reportSectionItems}
                  footerItem={{
                    id: "article-04",
                    label: "초보 개미 30초 한 줄 결론",
                  }}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BriefingPage() {
  return (
    <Suspense fallback={<BriefingSkeleton />}>
      <BriefingPageContent />
    </Suspense>
  )
}
