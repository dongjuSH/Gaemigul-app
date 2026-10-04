import type {
  HeatmapMarket,
  HeatmapNewsResponse,
  HeatmapPeriod,
  HeatmapResponse,
} from "@/lib/types/HeatmapType"

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "")

/** Read the backend snapshot. The browser never calls KIS or forces collection. */
export async function getHeatmap(
  market: HeatmapMarket,
  period: HeatmapPeriod,
  signal: AbortSignal
): Promise<HeatmapResponse> {
  const query = new URLSearchParams({ market, period })
  const response = await fetch(`${API_BASE_URL}/heatmap?${query}`, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(`히트맵을 불러오지 못했습니다. (${response.status})`)
  }

  const data: HeatmapResponse = await response.json()
  if (
    data.market !== market ||
    data.period !== period ||
    !Array.isArray(data.sectors)
  ) {
    throw new Error("요청한 시장과 기간의 데이터를 확인할 수 없습니다.")
  }
  return data
}

export async function getHeatmapNews(
  market: HeatmapMarket,
  period: HeatmapPeriod,
  expectedSectorCode: string,
  signal: AbortSignal
): Promise<HeatmapNewsResponse> {
  const query = new URLSearchParams({ market, period })
  const response = await fetch(`${API_BASE_URL}/heatmap/news?${query}`, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(`관련 뉴스를 불러오지 못했습니다. (${response.status})`)
  }
  const data: HeatmapNewsResponse = await response.json()
  if (data.sector_code !== expectedSectorCode || !Array.isArray(data.items)) {
    throw new Error("1위 업종이 변경되어 다음 갱신 때 뉴스를 다시 확인합니다.")
  }
  return {
    ...data,
    items: data.items
      .filter((item) => {
        try {
          const url = new URL(item.url)
          return (
            ["https:", "http:"].includes(url.protocol) && Boolean(item.title)
          )
        } catch {
          return false
        }
      })
      .slice(0, 4),
  }
}
