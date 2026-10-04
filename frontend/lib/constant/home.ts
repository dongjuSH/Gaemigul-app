// 백엔드 연동 전까지 사용하는 메인 페이지 더미 데이터.

export interface PheromoneScalePoint {
  value: number
  label: string
}

export const pheromoneScale: PheromoneScalePoint[] = [
  { value: 0, label: "극단적 저변동" },
  { value: 15, label: "안정" },
  { value: 25, label: "보통" },
  { value: 35, label: "고변동" },
  { value: 50, label: "극단적 충격" },
]

export const pheromoneMaxScale = 60

export interface PheromoneLevel {
  status: string
  statusEn: string
  description: string
  color: string
  /** 이 등급으로 판정되는 VIX 상한값(미포함). 마지막 구간은 Infinity. */
  max: number
}

/** VIX 값에 따른 등급·문구·색상 매핑. main.py 스케줄러가 30분마다 갱신하는 /market/vix 값을 기준으로 판정한다. */
export const pheromoneLevels: PheromoneLevel[] = [
  {
    status: "안정",
    statusEn: "Calm",
    description: "현재 시장 변동성이 낮고 안정적인 흐름을 유지하고 있어요.",
    color: "#4A90D9",
    max: 25,
  },
  {
    status: "보통",
    statusEn: "Normal",
    description: "현재 시장 변동성이 평소 수준이에요. 특별한 이상 신호는 없어요.",
    color: "#6FCF97",
    max: 35,
  },
  {
    status: "고변동",
    statusEn: "Volatile",
    description:
      "최근 시장 변동성이 커지고 있어요. 가격 움직임을 조금 더 주의 깊게 살펴보세요.",
    color: "#F0A63E",
    max: 50,
  },
  {
    status: "극단적 충격",
    statusEn: "Panic",
    description:
      "시장 변동성이 매우 큰 상태예요. 단기적으로 가격이 급격히 움직일 수 있어요.",
    color: "#FF2A2A",
    max: Infinity,
  },
]

export function getPheromoneLevel(vixValue: number): PheromoneLevel {
  return (
    pheromoneLevels.find((level) => vixValue < level.max) ??
    pheromoneLevels[pheromoneLevels.length - 1]
  )
}

// ── 글로벌 장운영 현황 ──────────────────────────────────────────

export interface MarketSessionSchedule {
  /** 국장 개장 */
  domesticOpen: string
  /** 국장 동시호가 시작 */
  domesticAuctionStart: string
  /** 국장 마감 */
  domesticClose: string
  /** 미국 프리마켓 시작 */
  usPreMarketStart: string
  /** 미국 정규장 시작(한국시간) */
  usRegularStart: string
  /** 미국 정규장 마감(한국시간, 익일) */
  usRegularEnd: string
}

/** 시:분(HH:mm) 문자열 기준 장 스케줄. 실데이터 연동 전까지 이 스케줄로 자동 전환 문구를 계산한다. */
export const marketSessionSchedule: MarketSessionSchedule = {
  domesticOpen: "09:00",
  domesticAuctionStart: "15:20",
  domesticClose: "15:30",
  usPreMarketStart: "17:00",
  usRegularStart: "22:30",
  usRegularEnd: "05:00",
}

// ── 개미굴 소란지수 ──────────────────────────────────────────

export interface PheromoneSignalLevel {
  /** 와이파이 신호 막대 중 채워지는 개수(1~5) */
  bars: number
  label: string
  description: string
  /** 이 등급으로 판정되는 상한값(미포함). 마지막 구간은 Infinity. */
  max: number
}

/** 값(0~100) → 채워지는 막대 개수·라벨·설명 문구 매핑 */
export const pheromoneSignalLevels: PheromoneSignalLevel[] = [
  {
    bars: 1,
    label: "신호 약함",
    description: "지금 개미들 사이에 신호가 약하게 퍼지고 있어요",
    max: 20,
  },
  {
    bars: 2,
    label: "신호 감지됨",
    description: "지금 개미들 사이에 신호가 감지되고 있어요",
    max: 40,
  },
  {
    bars: 3,
    label: "신호 보통",
    description: "지금 개미들 사이에 신호가 보통 수준으로 퍼지고 있어요",
    max: 60,
  },
  {
    bars: 4,
    label: "신호 강함",
    description: "지금 개미들 사이에 신호가 강하게 퍼지고 있어요",
    max: 80,
  },
  {
    bars: 5,
    label: "신호 매우 강함",
    description: "지금 개미들 사이에 신호가 매우 강하게 퍼지고 있어요",
    max: Infinity,
  },
]

export function getPheromoneSignalLevel(value: number): PheromoneSignalLevel {
  return (
    pheromoneSignalLevels.find((level) => value < level.max) ??
    pheromoneSignalLevels[pheromoneSignalLevels.length - 1]
  )
}

/** 채워진 막대 개수(1~5)에 대응하는 브랜드 레드 톤 — 신호가 강할수록 진해진다. */
export const pheromoneSignalBarColors = [
  "#FFD4D4",
  "#FFA8A8",
  "#FF7A7A",
  "#FF4A4A",
  "#FF2A2A",
]

// ── 원/달러 환율 추이 ──────────────────────────────────────────

export type UsdKrwRange = "day" | "week5" | "month"

export const usdKrwRangeLabels: Record<UsdKrwRange, string> = {
  day: "하루",
  week5: "5일",
  month: "월별",
}

