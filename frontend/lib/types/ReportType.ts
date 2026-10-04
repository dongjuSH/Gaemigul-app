export type ReportBadgeLabel = "1 WEEK" | "DAY"

/** 우측 브리핑 사이드바 카드 한 개(일간 또는 주간 보고서). */
export type ReportListCardItem = {
  /** 라우팅 쿼리 조합용 id (`${type}-${date}`) */
  id: string
  type: "daily" | "weekly"
  /** GET /timeline/report?date= 에 그대로 쓰는 날짜(일간은 그날, 주간은 종료일) */
  date: string
  /** 왼쪽 배지 위쪽 라벨. 일간 "9", 주간 "9" */
  month: string
  /** 가운데 큰 숫자. 일간은 날짜(예: "15"), 주간은 몇 주차인지(예: "4") */
  dateLabel: string
  /** 아래쪽 작은 라벨. 일간은 요일(예: "화"), 주간은 "주차" */
  unitLabel: string
  title: string
  description: string
  badgeLabel: ReportBadgeLabel
}

export type ReportWeekSection = {
  id: string
  rangeLabel: string
  items: ReportListCardItem[]
}

// ── 백엔드 GET /timeline/reports, /timeline/report 응답 DTO ──

export type ApiReportListItem = {
  report_type: "DAILY" | "WEEKLY"
  start_date: string
  end_date: string
  title: string
  summary: string | null
}

export type ApiReportWeekGroup = {
  year: number
  month: number
  week_of_month: number
  week_label: string
  start_date: string
  end_date: string
  weekly: ApiReportListItem | null
  dailies: ApiReportListItem[]
}

export type ApiReportListResponse = {
  year: number
  month: number
  weeks: ApiReportWeekGroup[]
}

/** 섹션 핵심 요약 한 줄 (백엔드 ReportPointItem, backend/domain/timeline/schemas/report.py) */
export type ApiReportPointItem = {
  seq: number
  body: string
  /** "ok" | "checking" - checking이면 아직 검수 중이라는 뜻(문구는 ApiReportResponse.review_message) */
  review_status: string
}

export type ApiReportSection = {
  seq: number
  title: string | null
  description: string | null
  image_url: string | null
  /** 핵심 요약 3개 */
  points: ApiReportPointItem[]
}

export type ApiReportQuarter = {
  label: string
  usd_krw: number | null
  foreign_net_buy: number | null
  is_current: boolean
}

export type ApiReportSector = {
  sector_name: string
  change_rate: number | null
  rising_count: number | null
  total_count: number | null
  rising_ratio: number | null
  trade_amount: number | null
  prev_trade_amount: number | null
  trade_amount_change_rate: number | null
}

export type ApiReportKeyword = {
  title: string
  description: string
}

export type ApiReportTerm = {
  term: string
  description: string
}

export type ApiReportResponse = {
  report_type: "DAILY" | "WEEKLY"
  start_date: string
  end_date: string
  published_at: string | null
  title: string | null
  summary: string | null
  main_image_url: string | null
  /** review_status가 "checking"인 문구에 띄울 안내 문구 (문구마다 같다) */
  review_message: string
  sections: ApiReportSection[]
  foreign_net_buy: number | null
  foreign_badge: string | null
  vkospi: number | null
  vkospi_change_rate: number | null
  vkospi_badge: string | null
  quarters: ApiReportQuarter[]
  sector: ApiReportSector | null
  conclusion: string | null
  keywords: ApiReportKeyword[]
  terms: ApiReportTerm[]
}
