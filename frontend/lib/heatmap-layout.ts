import type { HeatmapSector } from "@/lib/types/HeatmapType"

/** 기업 5개를 표시할 수 있는 업종 중 시가총액 상위 15개를 선택한다. */
export function selectHeatmapSectors(
  sectors: HeatmapSector[]
): HeatmapSector[] {
  return sectors
    .filter(
      (sector) => Number.isFinite(sector.market_cap) && sector.market_cap > 0
    )
    .map((sector) => ({
      ...sector,
      stocks: sector.stocks
        .filter(
          (stock) => Number.isFinite(stock.market_cap) && stock.market_cap > 0
        )
        .sort(
          (a, b) => b.market_cap - a.market_cap || a.code.localeCompare(b.code)
        ),
    }))
    .filter((sector) => sector.stocks.length >= 5)
    .sort((a, b) => b.market_cap - a.market_cap || a.code.localeCompare(b.code))
    .slice(0, 15)
    .map((sector) => ({
      ...sector,
      stocks: sector.stocks.slice(0, 5),
    }))
}

export interface HeatmapRect<T> {
  item: T
  x: number
  y: number
  width: number
  height: number
}

/**
 * Squarified treemap: keep adjacent rectangles readable while preserving the
 * supplied weights. All weights are normalized to fit the available bounds.
 */
export function layoutTreemap<T>(
  items: T[],
  getWeight: (item: T) => number,
  width: number,
  height: number
): HeatmapRect<T>[] {
  const weighted = items
    .map((item) => ({ item, weight: getWeight(item) }))
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0)
    .sort((a, b) => b.weight - a.weight)
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  if (!total || width <= 0 || height <= 0) return []

  const remaining = weighted.map(({ item, weight }) => ({
    item,
    area: (weight / total) * width * height,
  }))
  const result: HeatmapRect<T>[] = []
  let x = 0
  let y = 0
  let availableWidth = width
  let availableHeight = height
  let index = 0

  function worst(areas: number[], side: number) {
    const sum = areas.reduce((value, area) => value + area, 0)
    const squared = sum * sum
    const sideSquared = side * side
    return Math.max(
      (sideSquared * Math.max(...areas)) / squared,
      squared / (sideSquared * Math.min(...areas))
    )
  }

  while (index < remaining.length) {
    const side = Math.min(availableWidth, availableHeight)
    const row = [remaining[index++]]
    while (
      index < remaining.length &&
      worst([...row.map((entry) => entry.area), remaining[index].area], side) <=
        worst(
          row.map((entry) => entry.area),
          side
        )
    ) {
      row.push(remaining[index++])
    }

    const area = row.reduce((sum, entry) => sum + entry.area, 0)
    const vertical = availableWidth >= availableHeight
    const thickness = area / (vertical ? availableHeight : availableWidth)
    let offset = 0
    row.forEach((entry, rowIndex) => {
      const length =
        rowIndex === row.length - 1
          ? (vertical ? availableHeight : availableWidth) - offset
          : entry.area / thickness
      result.push({
        item: entry.item,
        x: x + (vertical ? 0 : offset),
        y: y + (vertical ? offset : 0),
        width: vertical ? thickness : length,
        height: vertical ? length : thickness,
      })
      offset += length
    })

    if (vertical) {
      x += thickness
      availableWidth = Math.max(0, width - x)
    } else {
      y += thickness
      availableHeight = Math.max(0, height - y)
    }
  }
  return result
}

/** 시총 순서를 유지하면서 40%는 균등 배분해 작은 업종·기업도 보이게 한다. */
export function layoutMarketCapTreemap<T>(
  items: T[],
  getMarketCap: (item: T) => number,
  width: number,
  height: number
): HeatmapRect<T>[] {
  const valid = items.filter((item) => {
    const cap = getMarketCap(item)
    return Number.isFinite(cap) && cap > 0
  })
  const total = valid.reduce(
    (sum, item) => sum + Math.pow(getMarketCap(item), 0.35),
    0
  )
  return layoutTreemap(
    valid,
    (item) =>
      0.6 * (Math.pow(getMarketCap(item), 0.35) / total) + 0.4 / valid.length,
    width,
    height
  )
}

export function formatChange(rate: number | null) {
  if (rate === null || !Number.isFinite(rate)) return "등락률 미제공"
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`
}

export function heatmapColor(rate: number | null) {
  if (rate === null || !Number.isFinite(rate)) return "#5c6b80"
  if (rate === 0) return "#475569"
  const strength = Math.min(Math.abs(rate) / 5, 1)
  const base = [71, 85, 105]
  const target = rate > 0 ? [190, 48, 66] : [36, 87, 163]
  const color = base.map((value, i) =>
    Math.round(value + (target[i] - value) * (0.28 + strength * 0.72))
  )
  return `rgb(${color.join(", ")})`
}

export function formatKoreanAmount(value: number, unit = "원") {
  if (!Number.isFinite(value)) return "—"
  if (value >= 1_000_000_000_000)
    return `${(value / 1_000_000_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}조 ${unit}`
  if (value >= 100_000_000)
    return `${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억 ${unit}`
  if (value >= 10_000)
    return `${(value / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만 ${unit}`
  return `${value.toLocaleString("ko-KR")} ${unit}`
}
