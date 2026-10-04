import { marketSessionSchedule } from "@/lib/constant/home"

export type ActiveMarket = "domestic" | "us"

export interface MarketSessionState {
  active: ActiveMarket
  caption: string
}

function timeToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number)
  return hours * 60 + minutes
}

/** 자정을 넘나드는 구간 판정을 위한 24시간(1440분) 순환 보정. */
function inRange(minutes: number, start: number, end: number): boolean {
  if (start <= end) return minutes >= start && minutes < end
  return minutes >= start || minutes < end
}

/**
 * 현재 시각(분 단위, 0~1439)에 따른 장운영 상태.
 * 국장(09:00~15:30) → 마감 후 미국 프리마켓(17:00) → 정규장(22:30~05:00) → 국장 개장 대기 순으로 자동 전환된다.
 */
export function getMarketSessionState(minutes: number): MarketSessionState {
  const open = timeToMinutes(marketSessionSchedule.domesticOpen)
  const auctionStart = timeToMinutes(marketSessionSchedule.domesticAuctionStart)
  const close = timeToMinutes(marketSessionSchedule.domesticClose)
  const usPre = timeToMinutes(marketSessionSchedule.usPreMarketStart)
  const usRegular = timeToMinutes(marketSessionSchedule.usRegularStart)
  const usEnd = timeToMinutes(marketSessionSchedule.usRegularEnd)

  if (inRange(minutes, open, auctionStart)) {
    return { active: "domestic", caption: "국장이 열려 있어요! (15:30 장 마감 예정)" }
  }
  if (inRange(minutes, auctionStart, close)) {
    return { active: "domestic", caption: "국장이 열려 있어요! (15:30 동시호가 마감)" }
  }
  if (inRange(minutes, close, usPre)) {
    return { active: "us", caption: "국장 마감! 미국 프리마켓 17:00 시작" }
  }
  if (inRange(minutes, usPre, usRegular)) {
    return { active: "us", caption: "미국 프리마켓이 진행 중이에요 (22:30 정규장 시작)" }
  }
  if (inRange(minutes, usRegular, usEnd)) {
    return { active: "us", caption: "미국 정규장이 열려 있어요! (05:00 마감)" }
  }
  return { active: "domestic", caption: "국장 개장을 준비하고 있어요 (09:00 개장)" }
}

/** 오늘자 국장 마감(HH:mm)을 이미 지났는지 여부. 마감 전이면 전일 마감 기준 데이터를 보여줘야 한다. */
export function isAfterDomesticClose(minutes: number): boolean {
  const open = timeToMinutes(marketSessionSchedule.domesticOpen)
  const close = timeToMinutes(marketSessionSchedule.domesticClose)
  return minutes >= close || minutes < open
}

/**
 * 시간대별 거래대금/투자자 매매동향 데이터의 갱신 기준 시각(HH:mm).
 * 백엔드가 국장 마감(15:30) 데이터를 15:35에 적재하므로, 그보다 더 안전하게 15:40 이후에 당일
 * 데이터를 노출한다. 그 전에는 전일 데이터를 보여준다.
 */
export const INTRADAY_DATA_REFRESH_TIME = "15:40"

/** 오늘자 인트라데이 데이터 갱신 기준(15:40)을 이미 지났는지 여부. */
export function isAfterIntradayDataRefresh(minutes: number): boolean {
  const open = timeToMinutes(marketSessionSchedule.domesticOpen)
  const refresh = timeToMinutes(INTRADAY_DATA_REFRESH_TIME)
  return minutes >= refresh || minutes < open
}
