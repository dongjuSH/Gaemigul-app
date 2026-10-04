import type {
  BriefingArticle,
  BriefingContent,
  BriefingStatCard,
  BriefingStatTone,
  BriefingTakeawayPoint,
} from "@/lib/types/BriefingType"
import type { ApiReportPointItem, ApiReportResponse } from "@/lib/types/ReportType"

// 백엔드 섹션 순번(seq)이 뜻하는 바는 고정이다 (backend/domain/timeline/Claude.md '보고서 설계' 참고).
const SECTION_EYEBROW: Record<number, string> = {
  1: "핵심 이슈 (원인 분석)",
  2: "시장 전체 반응 (결과 & 실증 데이터)",
  3: "주목할 섹터 (실제 사례)",
}

function rateTone(rate: number | null | undefined): BriefingStatTone {
  if (rate === null || rate === undefined) return "neutral"
  return rate >= 0 ? "increase" : "decrease"
}

function formatRate(rate: number | null | undefined) {
  if (rate === null || rate === undefined) return "-"
  const sign = rate >= 0 ? "+" : ""
  return `${sign}${rate.toFixed(2)}%`
}

/** 백만원 단위 금액을 "1조 5,458억원" 형태로 바꾼다. (억·조 표기는 프런트 담당 — 백엔드 스키마 주석) */
function formatWon(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "-"

  const sign = amount < 0 ? "-" : ""
  const abs = Math.abs(amount)
  let trillions = Math.floor(abs / 1_000_000)
  let billions = Math.round((abs % 1_000_000) / 100)
  if (billions >= 10_000) {
    trillions += 1
    billions -= 10_000
  }

  const parts: string[] = []
  if (trillions > 0) parts.push(`${trillions.toLocaleString("ko-KR")}조`)
  if (billions > 0 || parts.length === 0) {
    parts.push(`${billions.toLocaleString("ko-KR")}억`)
  }

  return `${sign}${parts.join(" ")}원`
}

function formatPublishedAt(value: string | null) {
  if (!value) return "발행 준비 중"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "발행 준비 중"

  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} KST`
}

function buildSecondSectionStatCards(
  report: ApiReportResponse
): BriefingStatCard[] {
  const cards: BriefingStatCard[] = []

  if (report.foreign_net_buy !== null) {
    cards.push({
      label: "외국인 순매수",
      value: formatWon(report.foreign_net_buy),
      changeLabel: report.foreign_badge ?? undefined,
      tone: rateTone(report.foreign_net_buy),
    })
  }

  if (report.vkospi !== null) {
    cards.push({
      label: "KOSPI 변동성 지수 (VKOSPI)",
      value: `${report.vkospi.toFixed(2)}pt`,
      changeLabel: report.vkospi_badge ?? undefined,
      tone: rateTone(report.vkospi_change_rate),
    })
  }

  return cards
}

function buildThirdSectionStatCards(
  report: ApiReportResponse
): BriefingStatCard[] | undefined {
  const sector = report.sector
  if (!sector) return undefined

  const cards: BriefingStatCard[] = [
    {
      label: `${sector.sector_name} 등락률`,
      value: formatRate(sector.change_rate),
      tone: rateTone(sector.change_rate),
    },
  ]

  if (sector.rising_ratio !== null && sector.total_count !== null) {
    cards.push({
      label: "상승 종목 비율",
      value: `${sector.rising_ratio.toFixed(0)}%`,
      changeLabel: `${sector.total_count}개 중 ${sector.rising_count ?? 0}개 상승`,
      tone: "neutral",
    })
  }

  if (sector.trade_amount !== null) {
    cards.push({
      label: "거래대금",
      value: formatWon(sector.trade_amount),
      changeLabel:
        sector.trade_amount_change_rate !== null
          ? `${formatRate(sector.trade_amount_change_rate)} (전일 ${formatWon(sector.prev_trade_amount)})`
          : undefined,
      tone: rateTone(sector.trade_amount_change_rate),
    })
  }

  return cards
}

function buildCorrelationChart(report: ApiReportResponse) {
  if (report.quarters.length === 0) return undefined

  return {
    title: "분기별 원/달러 환율 · 외국인 순매수 추이",
    footnoteLeft: "최근 6개 분기 기준",
    footnoteRight: "데이터 기준: 한국투자증권",
    data: report.quarters.map((quarter) => ({
      label: quarter.label,
      fxRate: quarter.usd_krw ?? 0,
      netSell:
        quarter.foreign_net_buy !== null
          ? Number((quarter.foreign_net_buy / 1_000_000).toFixed(2))
          : 0,
      highlighted: quarter.is_current,
    })),
  }
}

/** 백엔드의 섹션 핵심 요약 한 줄(ApiReportPointItem)을 화면이 쓰는 객체로 바꾼다.
 * sectionSeq를 같이 받는 건 point.seq만으로는 섹션이 다른 point끼리 id가 겹칠 수 있어서다. */
function toTakeawayPoint(sectionSeq: number, point: ApiReportPointItem): BriefingTakeawayPoint {
  return {
    id: `${sectionSeq}-${point.seq}`,
    text: point.body,
    isChecking: point.review_status === "checking",
  }
}

function buildArticles(report: ApiReportResponse): BriefingArticle[] {
  return report.sections.map((section) => ({
    id: `article-0${section.seq}`,
    index: String(section.seq).padStart(2, "0"),
    eyebrow: SECTION_EYEBROW[section.seq] ?? `섹션 ${section.seq}`,
    title: section.title ?? "제목을 준비 중이에요",
    body: section.description ?? "본문을 준비 중이에요.",
    imageUrl: section.seq === 1 ? section.image_url : undefined,
    statCards:
      section.seq === 2
        ? buildSecondSectionStatCards(report)
        : section.seq === 3
          ? buildThirdSectionStatCards(report)
          : undefined,
    correlationChart:
      section.seq === 2 ? buildCorrelationChart(report) : undefined,
    takeaways: section.points.map((point) => toTakeawayPoint(section.seq, point)),
  }))
}

/** GET /timeline/report 응답을 브리핑 페이지 컴포넌트가 쓰는 형태로 바꾼다. */
export function mapReportToBriefingContent(
  report: ApiReportResponse
): BriefingContent {
  const isWeekly = report.report_type === "WEEKLY"

  return {
    tag: isWeekly ? "WEEKLY" : "DAILY",
    category: isWeekly ? "주간 심층 브리핑" : "일간 브리핑",
    title: report.title ?? "브리핑을 준비 중이에요",
    publishedAt: formatPublishedAt(report.published_at),
    analyst: "개미굴 AI 리서치팀",
    lead: report.summary ?? "요약을 준비 중이에요.",
    mainImageUrl: report.main_image_url,
    todayBriefPoints: report.sections
      .map((section) =>
        section.points[0] ? toTakeawayPoint(section.seq, section.points[0]) : null
      )
      .filter((point): point is BriefingTakeawayPoint => point !== null),
    reviewMessage: report.review_message,
    article: buildArticles(report),
    noviceSummary: {
      quote: report.conclusion
        ? `💭 쉽게 말하면 오늘은 이런 하루였어요!\n"${report.conclusion}"`
        : "결론을 준비 중이에요.",
      todoItems: report.keywords,
    },
    glossary: report.terms,
  }
}

/** 사람이 읽을 수 있는 상태인지(제목·섹션이 실제로 채워졌는지) 판단한다. */
export function isReportReady(
  report: ApiReportResponse | null
): report is ApiReportResponse {
  return Boolean(report && report.title && report.sections.length > 0)
}
