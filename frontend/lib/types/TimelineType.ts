export type TimelineStatus = "past" | "current" | "next" | "upcoming"

export type TimelineItem = {
  id: string
  time: string
  title: string
  description: string
  /** 섹션 제목 옆 info 아이콘 툴팁에 노출할, "왜 이 시간대를 봐야 하는지" 설명 */
  infoText: string
}

export type ScheduleItem = TimelineItem & {
  status: TimelineStatus
  badgeLabel: string
}

export type MarketStat = {
  label: string
  value: string
  rate: string
  isPositive: boolean
  /** 비교 기준(예: 07:30) 값 — 있으면 카드 안에 작고 연하게 함께 표시한다. */
  previousValue?: string
  previousLabel?: string
}

export type MarketStatGroup = {
  groupLabel: string
  stats: MarketStat[]
}

export type SummaryAccent = "red" | "orange" | "green"

export type LLMSummaryPoint = {
  id: string
  badgeLabel: string
  title: string
  description: string
  accent: SummaryAccent
}

export type LLMSummary = {
  title: string
  subtitle: string
  points: LLMSummaryPoint[]
}

export type BeginnerSummaryPoint = {
  id: string
  title: string
  description: string
  /** 카드 하단에 보여줄 태그. 카드마다 2개씩 넣는다. */
  tags: string[]
}

export type BeginnerSummary = {
  /** 백엔드가 전체 해설 제목/부제를 따로 주지 않으므로 없으면 렌더링을 생략한다. */
  title?: string
  subtitle?: string
  points: BeginnerSummaryPoint[]
}

export type NewsItem = {
  id: string
  content: string
  source: string
  /** 원문 뉴스 링크. 아직 실제 URL이 연결되지 않은 목데이터는 "#"으로 둔다. */
  url: string
}

export type SectorStock = {
  name: string
  badge: string
  rate: string
}

export type SectorItem = {
  id: string
  name: string
  rate: string
  /** 상승 1위·거래 1위 1~2개. 같은 종목이면 백엔드가 "상승·거래 1위" 한 줄로 합쳐서 보낸다. */
  stocks: SectorStock[]
}

/** 급등/급락 여부와 무관하게 시장에서 주목받는 특징 종목. */
export type FeaturedStock = {
  id: string
  name: string
  rate: string
  price: string
  badge: string
}

export type TimelineContent = {
  id: string
  marketStats?: MarketStatGroup[]
  llmSummary: LLMSummary
  beginnerSummary: BeginnerSummary
  news: NewsItem[]
  sectors?: SectorItem[]
  featuredStocks?: FeaturedStock[]
}

// ── 백엔드 GET /timeline 응답 DTO (backend/domain/timeline/schemas/timeline.py와 1:1 대응) ──

export type ApiBriefingPoint = {
  seq: number
  title: string
  body: string
}

export type ApiBeginnerGuide = {
  seq: number
  title: string
  body: string
  tags: string[]
}

export type ApiNewsItem = {
  seq: number
  title: string
  summary: string
  url: string
  published_at: string | null
}

export type ApiIndicator = {
  name: string
  price: number
  change_rate: number
}

export type ApiSectorStock = {
  name: string
  change_rate: number
  label: string
}

export type ApiLeadingSector = {
  name: string
  change_rate: number
  stocks: ApiSectorStock[]
}

export type ApiTopGainer = {
  seq: number
  name: string
  change_rate: number
  price: number
}

export type ApiIntradayChange = {
  name: string
  morning_price: number
  closing_price: number
  change_rate: number
}

export type ApiTimelineSlot = {
  slot_key: string
  time_slot: string
  title: string
  collected_at: string
  briefing_headline: string | null
  briefing_subtitle: string | null
  briefing_points: ApiBriefingPoint[]
  beginner_guides: ApiBeginnerGuide[]
  leading_sectors: ApiLeadingSector[]
  top_gainers: ApiTopGainer[]
  news: ApiNewsItem[]
  indicators: ApiIndicator[]
  intraday_changes: ApiIntradayChange[]
}
