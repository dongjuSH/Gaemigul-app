import type {
  ApiTimelineSlot,
  BeginnerSummary,
  FeaturedStock,
  LLMSummary,
  MarketStatGroup,
  NewsItem,
  SectorItem,
  SummaryAccent,
  TimelineContent,
} from "@/lib/types/TimelineType"

const ACCENTS: SummaryAccent[] = ["red", "orange", "green"]

function formatRate(value: number) {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function formatPrice(value: number) {
  const decimals = Number.isInteger(value) ? 0 : 2
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function mapIndicatorsToMarketStats(
  slot: ApiTimelineSlot
): MarketStatGroup[] | undefined {
  if (slot.indicators.length === 0) return undefined

  return [
    {
      groupLabel: "어제 마감 & 글로벌 현황",
      stats: slot.indicators.map((indicator) => ({
        label: indicator.name,
        value: formatPrice(indicator.price),
        rate: formatRate(indicator.change_rate),
        isPositive: indicator.change_rate >= 0,
      })),
    },
  ]
}

function mapIntradayToMarketStats(
  slot: ApiTimelineSlot
): MarketStatGroup[] | undefined {
  if (slot.intraday_changes.length === 0) return undefined

  return [
    {
      groupLabel: "장중 변화 (vs 07:30)",
      stats: slot.intraday_changes.map((change) => ({
        label: change.name,
        value: formatPrice(change.closing_price),
        rate: formatRate(change.change_rate),
        isPositive: change.change_rate >= 0,
        previousValue: formatPrice(change.morning_price),
        previousLabel: "07:30",
      })),
    },
  ]
}

function mapLLMSummary(slot: ApiTimelineSlot): LLMSummary {
  return {
    title: slot.briefing_headline ?? `${slot.title} 브리핑 준비 중`,
    subtitle: slot.briefing_subtitle ?? "",
    points: slot.briefing_points.map((point, index) => ({
      id: `${slot.slot_key}-point-${point.seq}`,
      badgeLabel: `POINT 0${point.seq}`,
      title: point.title,
      description: point.body,
      accent: ACCENTS[index % ACCENTS.length],
    })),
  }
}

function mapBeginnerSummary(slot: ApiTimelineSlot): BeginnerSummary {
  return {
    points: slot.beginner_guides.map((guide) => ({
      id: `${slot.slot_key}-guide-${guide.seq}`,
      title: guide.title,
      description: guide.body,
      tags: guide.tags,
    })),
  }
}

function mapNews(slot: ApiTimelineSlot): NewsItem[] {
  return slot.news.map((item) => ({
    id: `${slot.slot_key}-news-${item.seq}`,
    content: item.title,
    source: "NAVER",
    url: item.url || "#",
  }))
}

function mapSectors(slot: ApiTimelineSlot): SectorItem[] | undefined {
  if (slot.leading_sectors.length === 0) return undefined

  return slot.leading_sectors.map((sector, index) => ({
    id: `${slot.slot_key}-sector-${index}`,
    name: sector.name,
    rate: formatRate(sector.change_rate),
    stocks: sector.stocks.map((stock) => ({
      name: stock.name,
      badge: stock.label,
      rate: formatRate(stock.change_rate),
    })),
  }))
}

function mapFeaturedStocks(slot: ApiTimelineSlot): FeaturedStock[] | undefined {
  if (slot.top_gainers.length === 0) return undefined

  return slot.top_gainers.map((gainer) => ({
    id: `${slot.slot_key}-stock-${gainer.seq}`,
    name: gainer.name,
    rate: formatRate(gainer.change_rate),
    price: formatPrice(gainer.price),
    badge: `상승 ${gainer.seq}위`,
  }))
}

export function mapSlotToContent(slot: ApiTimelineSlot): TimelineContent {
  const marketStats =
    mapIndicatorsToMarketStats(slot) ?? mapIntradayToMarketStats(slot)

  return {
    id: slot.slot_key,
    marketStats,
    llmSummary: mapLLMSummary(slot),
    beginnerSummary: mapBeginnerSummary(slot),
    news: mapNews(slot),
    sectors: mapSectors(slot),
    featuredStocks: mapFeaturedStocks(slot),
  }
}
