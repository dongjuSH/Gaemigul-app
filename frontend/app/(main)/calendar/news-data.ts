/* 뉴스 데이터 — GET /calendar/events(back/feat/calendar) 응답을 NewsItem으로 변환한다 */

import type { CalendarEventDto } from "@/lib/api/calendar"

export type Category =
  "macro" | "rate" | "dividend" | "earnings" | "optionExpiry"

export type NewsItem = {
  id: string // 뉴스 항목을 구분하는 고유 식별자
  title: string // 뉴스 제목
  summary: string // 뉴스 목록과 상세 팝업에 표시할 요약 내용
  category: Category // 뉴스 분류 및 색상 스타일을 결정하는 카테고리
  region: string // 관련 국가, 지역 또는 기업명
  publishedAt: Date // 뉴스 발표 일시 및 캘린더에 표시할 날짜
  hasTime: boolean // 발표 시간이 확인된 일정인지 여부
  /** 팝업 상세에만 노출 — 있는 값만 표시 */
  detail?: {
    actual?: string // 실제값
    actualLabel?: string // actual이 무엇에 대한 값인지(예: "공모가", "주당", "매출액") — 없으면 "실제값"으로 표시
    previous?: string // 이전치
    source?: string // 발표처 (백엔드 미제공 필드 — 항상 없음)
    sectors?: string[] // 관련 수혜 섹터 (백엔드 미제공 필드 — 항상 없음)
  }
}

/** 국내 관련으로 취급할 지역/기업명 키워드 — 나머지는 전부 해외로 분류 */
const DOMESTIC_KEYWORDS = ["한국", "삼성전자"]

/** region 문자열 → 국내/해외 구분 */
export function scopeOf(region: string): "domestic" | "overseas" {
  return DOMESTIC_KEYWORDS.some((k) => region.includes(k))
    ? "domestic"
    : "overseas"
}

/** region 문자열 → 국가 ISO 코드(flag-icons용, 소문자) 매핑 키워드 */
const COUNTRY_CODE_BY_KEYWORD: [string, string][] = [
  ["한국", "kr"],
  ["삼성전자", "kr"],
  ["중국", "cn"],
  ["일본", "jp"],
  ["유로존", "eu"],
]

/** region 문자열 → 국가 ISO 코드 (매칭 없으면 미국 취급) */
export function countryCodeOf(region: string): string {
  return COUNTRY_CODE_BY_KEYWORD.find(([k]) => region.includes(k))?.[1] ?? "us"
}

export const CAT: Record<
  Category,
  {
    label: string // 화면에 표시할 카테고리 이름
    dot: string // 카테고리 표시 점의 Tailwind 배경색 클래스
    card: string // 뉴스 카드의 왼쪽 테두리와 배경색 클래스
    badge: string // 연한 배지(범례·서브 필터 등)에 쓰는 배경+글자색 클래스
  }
> = {
  macro: { label: '매크로', dot: 'bg-red-500', card: 'before:content-[""] before:bg-red-500 before:w-0.5 before:h-full before:absolute before:top-0 before:left-0', badge: 'bg-red-50 text-red-600' }, // prettier-ignore
  rate: { label: '금리', dot: 'bg-violet-500', card: 'before:content-[""] before:bg-violet-500 before:w-0.5 before:h-full before:absolute before:top-0 before:left-0', badge: 'bg-violet-50 text-violet-600' }, // prettier-ignore
  dividend: { label: '배당', dot: 'bg-amber-500', card: 'before:content-[""] before:bg-amber-500 before:w-0.5 before:h-full before:absolute before:top-0 before:left-0', badge: 'bg-amber-50 text-amber-700' }, // prettier-ignore
  earnings: { label: '기업실적', dot: 'bg-emerald-500', card: 'before:content-[""] before:bg-emerald-500 before:w-0.5 before:h-full before:absolute before:top-0 before:left-0', badge: 'bg-emerald-50 text-emerald-600' }, // prettier-ignore
  optionExpiry: { label: '옵션만기', dot: 'bg-cyan-500', card: 'before:content-[""] before:bg-cyan-500 before:w-0.5 before:h-full before:absolute before:top-0 before:left-0', badge: 'bg-cyan-50 text-cyan-600' }, // prettier-ignore
}

export const CATS = Object.keys(CAT) as Category[]

/** 상단 탭(경제지표/실적)이 묶는 카테고리 */
export type CategoryGroupId = "economic" | "performance"

export const CATEGORY_GROUPS: Record<
  CategoryGroupId,
  { label: string; categories: Category[] }
> = {
  economic: { label: "경제지표", categories: ["macro", "rate", "dividend"] },
  performance: { label: "실적", categories: ["earnings", "optionExpiry"] },
}

/** 알 수 없는 category 문자열(백엔드 스키마와 불일치)이면 임의로 분류하지 않고 걸러낸다 */
function isKnownCategory(value: string): value is Category {
  return (CATS as string[]).includes(value)
}

/** 날짜와 시간을 한국시간(KST)으로 해석한다. 시간이 없으면 날짜 정오를 사용해 날짜가 밀리지 않게 한다. */
function toPublishedAt(dto: CalendarEventDto): Date | null {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  const timePattern = /^\d{2}:\d{2}$/
  if (!datePattern.test(dto.publishedAt)) return null
  if (dto.time !== null && !timePattern.test(dto.time)) return null

  const value = `${dto.publishedAt}T${dto.time ?? "12:00"}:00+09:00`
  const publishedAt = new Date(value)
  return Number.isNaN(publishedAt.getTime()) ? null : publishedAt
}

/** 백엔드 GET /calendar/events 응답(CalendarEventDto) → 화면에서 쓰는 NewsItem으로 변환 */
export function toNewsItem(dto: CalendarEventDto): NewsItem | null {
  if (
    !dto.id ||
    !dto.title ||
    !dto.summary ||
    !dto.region ||
    !isKnownCategory(dto.category)
  ) {
    return null
  }

  const publishedAt = toPublishedAt(dto)
  if (!publishedAt) return null

  const detail: NewsItem["detail"] = {}
  if (dto.actual) detail.actual = dto.actual
  if (dto.actual_label) detail.actualLabel = dto.actual_label
  if (dto.previous) detail.previous = dto.previous

  return {
    id: dto.id,
    title: dto.title,
    summary: dto.summary,
    category: dto.category,
    region: dto.region,
    publishedAt,
    hasTime: dto.time !== null,
    detail: Object.keys(detail).length > 0 ? detail : undefined,
  }
}

/** 여러 연/월 조회 결과를 합칠 때 id 중복을 제거한다 */
export function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  return [...new Map(items.map((n) => [n.id, n])).values()]
}

export type MarketHoliday = {
  date: Date
  label: string // 달력에 표시할 휴장일 이름
  scope: "domestic" | "overseas" // 국내/해외 증시 구분
}

/** 증시 휴장일 (2026년 기준) — 국내(KRX)·해외(미국) */
export const MARKET_HOLIDAYS: MarketHoliday[] = (
  [
    ["2026-01-01", "신정", "domestic"],
    ["2026-02-16", "설날 연휴", "domestic"],
    ["2026-02-17", "설날", "domestic"],
    ["2026-02-18", "설날 연휴", "domestic"],
    ["2026-03-02", "삼일절 대체공휴일", "domestic"],
    ["2026-05-01", "근로자의 날", "domestic"],
    ["2026-05-05", "어린이날", "domestic"],
    ["2026-05-25", "부처님오신날 대체공휴일", "domestic"],
    ["2026-06-03", "제9회 전국동시지방선거", "domestic"],
    ["2026-06-08", "현충일 대체공휴일", "domestic"],
    ["2026-08-17", "광복절 대체공휴일", "domestic"],
    ["2026-09-24", "추석 연휴", "domestic"],
    ["2026-09-25", "추석", "domestic"],
    ["2026-10-05", "개천절 대체공휴일", "domestic"],
    ["2026-10-09", "한글날", "domestic"],
    ["2026-12-25", "성탄절", "domestic"],
    ["2026-12-31", "연말 휴장일", "domestic"],
    ["2026-09-07", "근로자의 날", "overseas"], // 미국 Labor Day
    ["2026-11-26", "추수감사절", "overseas"],
    ["2026-12-25", "크리스마스", "overseas"],
  ] as const
).map(([d, label, scope]) => ({
  date: new Date(`${d}T00:00:00`),
  label,
  scope,
}))
