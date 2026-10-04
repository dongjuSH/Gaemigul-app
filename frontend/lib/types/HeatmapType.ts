export type HeatmapMarket = "kospi" | "kosdaq"
export type HeatmapPeriod = "day" | "week" | "month"

export interface HeatmapStock {
  code: string
  name: string
  price: number
  market_cap: number
  change_rate: number | null
  volume: number
}

export interface HeatmapSector {
  code: string
  name: string
  market_cap: number
  volume: number
  change_rate: number | null
  stocks: HeatmapStock[]
}

export interface HeatmapRelatedSector {
  code: string
  name: string
  change_rate: number | null
  reason: string
  relationship_kind: "industry" | "market_trend"
  stocks: HeatmapStock[]
}

export interface HeatmapNewsItem {
  title: string
  url: string
  source: string
  published_at: string | null
  summary: string | null
}

export interface HeatmapNewsResponse {
  sector_code: string | null
  sector_name: string | null
  updated_at: string | null
  is_stale: boolean
  message: string | null
  items: HeatmapNewsItem[]
}

export interface HeatmapResponse {
  market: HeatmapMarket
  period: HeatmapPeriod
  updated_at: string | null
  as_of_date: string | null
  next_update_at: string | null
  market_status: "pre_open" | "open" | "closed" | "holiday" | "unknown"
  is_stale: boolean
  is_refreshing: boolean
  message: string | null
  coverage: {
    total_stocks: number
    priced_stocks: number
    missing_stocks: number
  }
  top_sector: {
    code: string
    name: string
    volume: number
    volume_share: number
    change_rate: number | null
  } | null
  sectors: HeatmapSector[]
  related_sectors?: HeatmapRelatedSector[]
}

/** 히트맵 보기 방식 - 지도(트리맵) / 목록(표) */
export type HeatmapView = "map" | "list"
