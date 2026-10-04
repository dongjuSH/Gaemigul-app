import type { HeatmapPeriod, HeatmapResponse } from "@/lib/types/HeatmapType"

export const PERIOD_LABELS: Record<HeatmapPeriod, string> = {
  day: "일일",
  week: "주간",
  month: "월간",
}

export const PERIOD_DESCRIPTIONS: Record<HeatmapPeriod, string> = {
  day: "전 거래일 종가 대비",
  week: "이번 주 시작 전 종가 대비",
  month: "이번 달 시작 전 종가 대비",
}

export const PERIOD_VOLUME_LABELS: Record<HeatmapPeriod, string> = {
  day: "오늘",
  week: "이번 주",
  month: "이번 달",
}

export const MARKET_STATUS: Record<HeatmapResponse["market_status"], string> = {
  pre_open: "장 시작 전",
  open: "장중",
  closed: "장 마감",
  holiday: "휴장일",
  unknown: "장 상태 확인 중",
}

export function formatTimestamp(
  value: string | null | undefined,
  timeOnly = false
) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—"
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(timeOnly ? {} : { month: "2-digit", day: "2-digit" }),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

/** 오늘(Asia/Seoul) 날짜의 데이터인지에 따라 거래량 배지 라벨을 결정한다. */
export function getVolumePeriodLabel(
  period: HeatmapPeriod,
  asOfDate: string | null | undefined
) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(new Date())
  if (asOfDate && asOfDate !== today) {
    return period === "day" ? `${asOfDate} 기준` : `기준일의 ${PERIOD_LABELS[period]}`
  }
  return PERIOD_VOLUME_LABELS[period]
}

const MARKET_CLOSE_MINUTES = 15 * 60 + 30

function seoulMinutesOfDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0)
  return hour * 60 + minute
}

/** 정규장 마감(15:30 KST) 이후인지 여부. 자동/수동 갱신을 멈추는 기준으로 쓰인다. */
export function isAfterMarketClose(date: Date = new Date()) {
  return seoulMinutesOfDay(date) >= MARKET_CLOSE_MINUTES
}

/** 남은 시간을 mm:ss(1시간 이상이면 hh:mm:ss)로 표시한다. */
export function formatCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.round(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}
