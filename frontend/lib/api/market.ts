import axios from "axios"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000"
const MARKET_URL = `${API_BASE_URL.replace(/\/$/, "")}/market`

export interface VixResponse {
  value: number
  change_value: number
  market_date: string | null
  updated_at: string
}

/** GET /market/vix — 캐시된 VIX 공포지수. 캐시가 없으면 503. */
export async function getVix(): Promise<VixResponse> {
  const response = await axios.get<VixResponse>(`${MARKET_URL}/vix`)
  return response.data
}

export interface SentimentResponse {
  score: number
  market_date: string
  updated_at: string
}

/** GET /market/sentiment — 개미굴 시장심리지수(개미굴 소란지수). 캐시가 없으면 503. */
export async function getSentiment(): Promise<SentimentResponse> {
  const response = await axios.get<SentimentResponse>(
    `${MARKET_URL}/sentiment`
  )
  return response.data
}

export type ExchangeRatePeriod = "today" | "5d" | "1m"

export interface ExchangeRatePoint {
  timestamp: string
  value: number
}

export interface ExchangeRateResponse {
  period: ExchangeRatePeriod
  points: ExchangeRatePoint[]
  requested_point_count: number
  is_complete: boolean
  updated_at: string
}

/** GET /market/exchange-rate — 원/달러 환율 차트(오늘·5일·1개월). 캐시가 없으면 503. */
export async function getExchangeRate(
  period: ExchangeRatePeriod = "today"
): Promise<ExchangeRateResponse> {
  const response = await axios.get<ExchangeRateResponse>(
    `${MARKET_URL}/exchange-rate`,
    { params: { period } }
  )
  return response.data
}

export interface InvestorFlowResponse {
  individual: number
  institution: number
  foreign: number
  unit: string
  market_date: string
  updated_at: string
}

/** GET /market/investor-flow — 개인·기관·외국인 순매수 금액(투자자별 매매동향). 캐시가 없으면 503. */
export async function getInvestorFlow(): Promise<InvestorFlowResponse> {
  const response = await axios.get<InvestorFlowResponse>(
    `${MARKET_URL}/investor-flow`
  )
  return response.data
}

export interface TradingValuePoint {
  time_slot: string
  amount: number
}

export interface TradingValueDistributionResponse {
  market_date: string
  points: TradingValuePoint[]
  unit: string
  updated_at: string
}

/** GET /market/trading-value-distribution — 정규장 30분 구간별 거래대금(시간대별 거래대금 분포). 캐시가 없으면 503. */
export async function getTradingValueDistribution(): Promise<TradingValueDistributionResponse> {
  const response = await axios.get<TradingValueDistributionResponse>(
    `${MARKET_URL}/trading-value-distribution`
  )
  return response.data
}
