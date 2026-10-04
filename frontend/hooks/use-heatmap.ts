"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { getHeatmap } from "@/lib/api/heatmap"
import { isAfterMarketClose } from "@/lib/heatmap-format"
import {
  beginManualRefresh,
  getManualRefreshWaitSeconds,
  getServerManualRefreshWaitSeconds,
  subscribeManualRefresh,
} from "@/lib/heatmap-refresh"
import type {
  HeatmapMarket,
  HeatmapPeriod,
  HeatmapResponse,
} from "@/lib/types/HeatmapType"

const FALLBACK_INTERVAL_MS = 10 * 60 * 1000

/** 장 마감(15:30 KST) 이후에는 자동 갱신을 멈춘다. null이면 다음 폴링을 예약하지 않는다. */
function nextPollDelay(data: HeatmapResponse | null): number | null {
  if (isAfterMarketClose()) return null
  // A first collection can take minutes; check progress without retriggering KIS.
  if (
    !data ||
    data.is_refreshing ||
    data.coverage.missing_stocks > 0 ||
    !data.sectors.length
  )
    return 15_000
  const nextUpdate = data?.next_update_at
    ? Date.parse(data.next_update_at)
    : Number.NaN
  if (!Number.isFinite(nextUpdate)) return FALLBACK_INTERVAL_MS
  return Math.min(
    FALLBACK_INTERVAL_MS,
    Math.max(15_000, nextUpdate - Date.now() + 2_000)
  )
}

export function useHeatmap(market: HeatmapMarket, period: HeatmapPeriod) {
  const [data, setData] = useState<HeatmapResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const refreshWaitSeconds = useSyncExternalStore(
    subscribeManualRefresh,
    getManualRefreshWaitSeconds,
    getServerManualRefreshWaitSeconds
  )
  const refresh = useCallback(() => {
    if (isLoading || isAfterMarketClose() || !beginManualRefresh()) return
    setRequestVersion((value) => value + 1)
  }, [isLoading])

  useEffect(() => {
    let disposed = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let requestController: AbortController | undefined

    async function poll() {
      setIsLoading(true)
      requestController = new AbortController()
      const timeout = setTimeout(() => requestController?.abort(), 30_000)
      let snapshot: HeatmapResponse | null = null
      try {
        snapshot = await getHeatmap(market, period, requestController.signal)
        if (disposed) return
        setData(snapshot)
        setError(null)
      } catch (cause) {
        if (disposed) return
        setError(
          cause instanceof Error && cause.name !== "AbortError"
            ? cause.message
            : "응답이 지연되고 있습니다. 잠시 후 다시 확인해 주세요."
        )
      } finally {
        clearTimeout(timeout)
        if (!disposed) {
          setIsLoading(false)
          const delay = nextPollDelay(snapshot)
          if (delay !== null) pollTimer = setTimeout(poll, delay)
        }
      }
    }

    void poll()
    return () => {
      disposed = true
      clearTimeout(pollTimer)
      requestController?.abort()
    }
  }, [market, period, requestVersion])

  return { data, isLoading, error, refresh, refreshWaitSeconds }
}
