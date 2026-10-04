import axios from "axios"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000"
const INDICATORS_URL = `${API_BASE_URL.replace(/\/$/, "")}/timeline/indicators`

export interface MarketIndicatorItem {
  code: string
  name: string
  price: number
  change_rate: number
}

export interface IndicatorBarResponse {
  updated_at: string
  items: MarketIndicatorItem[]
}

export async function getTimelineIndicators(): Promise<IndicatorBarResponse> {
  const response = await axios.get<IndicatorBarResponse>(INDICATORS_URL, {
    responseType: "json",
  })

  return response.data
}
