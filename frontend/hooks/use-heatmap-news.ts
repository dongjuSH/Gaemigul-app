"use client"

import { useEffect, useState } from "react"
import { getHeatmapNews } from "@/lib/api/heatmap"
import type {
  HeatmapMarket,
  HeatmapNewsResponse,
  HeatmapPeriod,
  HeatmapResponse,
} from "@/lib/types/HeatmapType"

interface NewsState {
  key: string
  data: HeatmapNewsResponse | null
  error: string | null
}

/** 시세 스냅샷과 함께 조회하며 별도 수동 갱신으로 60초 제한을 우회하지 않는다. */
export function useHeatmapNews(
  market: HeatmapMarket,
  period: HeatmapPeriod,
  snapshot: HeatmapResponse | null
) {
  const sectorCode = snapshot?.top_sector?.code
  const updatedAt = snapshot?.updated_at
  const key = JSON.stringify([market, period, sectorCode, updatedAt])
  const [state, setState] = useState<NewsState | null>(null)

  useEffect(() => {
    if (!sectorCode) return
    let disposed = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    void getHeatmapNews(market, period, sectorCode, controller.signal)
      .then((data) => {
        if (!disposed) setState({ key, data, error: null })
      })
      .catch((cause: unknown) => {
        if (disposed) return
        setState({
          key,
          data: null,
          error:
            cause instanceof Error && cause.name !== "AbortError"
              ? cause.message
              : "뉴스 응답이 지연되고 있습니다. 다음 갱신 때 다시 확인합니다.",
        })
      })
      .finally(() => clearTimeout(timeout))

    return () => {
      disposed = true
      clearTimeout(timeout)
      controller.abort()
    }
    // snapshot 객체 자체는 의존성에 넣지 않는다 - 폴링·새로고침마다 내용이 같아도 새 객체가 와서,
    // 넣으면 매번 진행 중인 뉴스 요청을 취소하고 다시 보낸다. 바뀜 판단은 key(시장·기간·1위 섹터·
    // 갱신 시각)로 충분하다
  }, [market, period, sectorCode, key])

  const current = state?.key === key ? state : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    isLoading: Boolean(sectorCode && !current),
  }
}
