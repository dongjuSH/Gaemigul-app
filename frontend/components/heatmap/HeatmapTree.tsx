"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { ArrowLeft, ChevronRight, Expand, Search, X } from "lucide-react"
import {
  formatChange,
  formatKoreanAmount,
  heatmapColor,
  layoutMarketCapTreemap,
  selectHeatmapSectors,
} from "@/lib/heatmap-layout"
import type {
  HeatmapSector,
  HeatmapStock,
  HeatmapView,
} from "@/lib/types/HeatmapType"
import HeatmapLegend from "./HeatmapLegend"
import HeatmapStockDetail from "./HeatmapStockDetail"

export default function HeatmapTree({
  sectors,
  view,
}: {
  sectors: HeatmapSector[]
  /** 지도/목록 전환 탭은 기간 탭 옆(HeatmapFilters)에 있어서 상태를 부모가 가진다 */
  view: HeatmapView
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const detailId = useId()
  const searchId = useId()
  const sectorId = useId()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [sectorCode, setSectorCode] = useState<string | null>(null)
  const [activeCode, setActiveCode] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const displayedSectors = useMemo(
    () => selectHeatmapSectors(sectors),
    [sectors]
  )
  const currentSector = displayedSectors.find(
    (sector) => sector.code === sectorCode
  )
  const visibleSectors = useMemo(
    () => (currentSector ? [currentSector] : displayedSectors),
    [currentSector, displayedSectors]
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [view])

  const sectorRects = useMemo(
    () =>
      layoutMarketCapTreemap(
        visibleSectors,
        (sector) => sector.market_cap,
        size.width,
        size.height
      ),
    [visibleSectors, size]
  )
  const allStocks = useMemo(
    () =>
      displayedSectors.flatMap((sector) =>
        sector.stocks.map((stock) => ({ sector, stock }))
      ),
    [displayedSectors]
  )
  const visibleStocks = useMemo(
    () =>
      visibleSectors.flatMap((sector) =>
        sector.stocks.map((stock) => ({ sector, stock }))
      ),
    [visibleSectors]
  )
  const selected = allStocks.find(({ stock }) => stock.code === activeCode)
  const query = search.trim().toLocaleLowerCase()
  const matchedStocks = useMemo(
    () =>
      visibleStocks.filter(
        ({ stock }) =>
          !query ||
          stock.name.toLocaleLowerCase().includes(query) ||
          stock.code.includes(query)
      ),
    [visibleStocks, query]
  )
  const matchedCodes = useMemo(
    () =>
      query ? new Set(matchedStocks.map(({ stock }) => stock.code)) : null,
    [matchedStocks, query]
  )
  const breadth = visibleStocks.reduce(
    (counts, { stock }) => {
      if (stock.change_rate === null) counts.missing++
      else if (stock.change_rate > 0) counts.up++
      else if (stock.change_rate < 0) counts.down++
      else counts.flat++
      return counts
    },
    { up: 0, down: 0, flat: 0, missing: 0 }
  )

  function selectSector(code: string | null) {
    setSectorCode(code)
    setActiveCode(null)
    setSearch("")
  }

  function stockTile(stock: HeatmapStock, width: number, height: number) {
    const showName = width >= 25 && height >= 21
    const showChange = width >= 52 && height >= 40
    const fontSize =
      width >= 125 && height >= 95
        ? 17
        : width >= 76 && height >= 65
          ? 12
          : width < 62
            ? 9
            : 11
    const selectedTile = activeCode === stock.code
    const dimmed = matchedCodes !== null && !matchedCodes.has(stock.code)
    return (
      <button
        type="button"
        tabIndex={dimmed ? -1 : 0}
        aria-label={`${stock.name}, ${formatChange(stock.change_rate)}, 시가총액 ${formatKoreanAmount(stock.market_cap)}`}
        title={`${stock.name} · ${formatChange(stock.change_rate)}\n현재가 ${stock.price.toLocaleString("ko-KR")}원\n시가총액 ${stock.market_cap.toLocaleString("ko-KR")}원`}
        aria-describedby={selectedTile ? detailId : undefined}
        onMouseEnter={() => setActiveCode(stock.code)}
        onFocus={() => setActiveCode(stock.code)}
        onClick={() => setActiveCode(stock.code)}
        className="absolute inset-px flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[2px] px-1 text-center text-white transition-[filter,opacity] hover:z-10 hover:brightness-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
        style={{
          backgroundColor: heatmapColor(stock.change_rate),
          boxShadow: selectedTile ? "inset 0 0 0 2px white" : undefined,
          opacity: dimmed ? 0.18 : 1,
          fontSize,
          lineHeight: 1.35,
        }}
      >
        {showName && (
          <span
            className={
              height >= 54
                ? "line-clamp-2 max-w-full font-semibold break-all"
                : "max-w-full truncate font-semibold"
            }
          >
            {stock.name}
          </span>
        )}
        {showChange && (
          <span className="mt-0.5 font-medium tabular-nums">
            {stock.change_rate === null ? "—" : formatChange(stock.change_rate)}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="min-w-0">
      {/* 모바일: 검색창 : 섹터 선택 = 8:2 */}
      <div className="mb-3 flex flex-wrap gap-2 max-md:grid max-md:grid-cols-[4fr_2fr]">
        <div className="relative min-w-40 flex-1 max-md:min-w-0">
          <Search
            className="pointer-events-none absolute top-3 left-3 size-4 text-neutral-400 max-md:top-1/2 max-md:-translate-y-1/2 dark:text-neutral-300"
            aria-hidden="true"
          />
          <label className="sr-only" htmlFor={searchId}>
            현재 표시 범위에서 기업명 또는 종목코드 검색
          </label>
          <input
            id={searchId}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearch("")
            }}
            placeholder="기업명 또는 종목코드 검색"
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-heatmap-border bg-heatmap-panel pr-4 pl-9 text-xs outline-offset-2 placeholder:text-neutral-400 focus-visible:outline-heatmap-accent max-md:h-11 max-md:text-sm dark:placeholder:text-neutral-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="검색어 지우기"
              className="absolute top-1 right-1 flex size-8 cursor-pointer items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 max-md:top-1/2 max-md:-translate-y-1/2 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <label className="sr-only" htmlFor={sectorId}>
          확대할 섹터 선택
        </label>
        <select
          id={sectorId}
          value={currentSector?.code ?? ""}
          onChange={(event) => selectSector(event.target.value || null)}
          className="h-10 max-w-full min-w-32 rounded-lg border border-heatmap-border bg-heatmap-panel px-3 text-xs text-neutral-700 outline-offset-2 focus-visible:outline-heatmap-accent max-md:h-11 max-md:w-full max-md:min-w-0 max-md:px-1.5 max-md:text-sm dark:text-neutral-300"
        >
          <option value="">전체 섹터</option>
          {displayedSectors.map((sector) => (
            <option key={sector.code} value={sector.code}>
              {sector.name}
            </option>
          ))}
        </select>
      </div>
      {currentSector && (
        <button
          type="button"
          onClick={() => selectSector(null)}
          className="mb-3 flex min-h-8 cursor-pointer items-center gap-1.5 rounded text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="size-3.5" /> 전체 지도{" "}
          <ChevronRight className="size-3" /> {currentSector.name}
        </button>
      )}
      {query && (
        <div
          role="status"
          className="mb-3 rounded-lg bg-heatmap-panel px-3 py-2 text-xs leading-5 text-neutral-600 dark:text-neutral-400"
        >
          {matchedStocks.length ? (
            <>
              <span>
                현재 범위에서 {matchedStocks.length}개 기업을 찾았습니다.
              </span>
              <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                {matchedStocks.map(({ stock }) => (
                  <button
                    key={stock.code}
                    type="button"
                    onClick={() => setActiveCode(stock.code)}
                    className="cursor-pointer rounded border border-heatmap-border bg-heatmap-panel px-2 py-1 hover:border-neutral-400 dark:hover:border-neutral-500"
                  >
                    {stock.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            "일치하는 기업이 없습니다. 검색어 또는 선택한 섹터를 확인해 주세요."
          )}
        </div>
      )}
      <HeatmapStockDetail id={detailId} selected={selected} />
      {view === "map" ? (
        <>
          <div
            className="mt-2 overflow-x-auto overscroll-x-contain rounded-xl border border-heatmap-border bg-heatmap-canvas p-1"
            tabIndex={0}
            role="region"
            aria-label="주식 지도, 작은 화면에서는 좌우 스크롤 가능"
          >
            <div
              ref={containerRef}
              className={`relative w-full ${currentSector ? "h-[440px] min-w-[280px] sm:h-[620px]" : "h-[700px] min-w-[640px]"}`}
              aria-label={
                currentSector
                  ? `${currentSector.name} 섹터 지도`
                  : "전체 섹터 지도"
              }
            >
              {sectorRects.map(({ item: sector, x, y, width, height }) => {
                const compact = width < 58 || height < 48
                const headerHeight = compact ? height : 28
                const stocks = compact
                  ? []
                  : layoutMarketCapTreemap(
                      sector.stocks,
                      (stock) => stock.market_cap,
                      Math.max(0, width - 6),
                      Math.max(0, height - headerHeight - 6)
                    )
                return (
                  <div
                    key={sector.code}
                    className="absolute overflow-hidden rounded-md border-2 border-heatmap-canvas bg-heatmap-canvas"
                    style={{ left: x, top: y, width, height }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        selectSector(currentSector ? null : sector.code)
                      }
                      aria-label={`${sector.name}, ${formatChange(sector.change_rate)}, ${currentSector ? "전체 보기" : "확대 보기"}`}
                      title={`${sector.name} · ${formatChange(sector.change_rate)}`}
                      className="flex w-full cursor-pointer items-center justify-between gap-1 overflow-hidden px-1.5 text-left text-[11px] font-semibold text-neutral-700 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:focus-visible:outline-neutral-300"
                      style={{ height: headerHeight - 2 }}
                    >
                      <span className="truncate">{sector.name}</span>
                      {width > 155 ? (
                        <span
                          className={`shrink-0 text-[10px] tabular-nums ${sector.change_rate == null || sector.change_rate === 0 ? "text-neutral-500 dark:text-neutral-400" : sector.change_rate > 0 ? "text-red-700 dark:text-red-400" : "text-blue-700 dark:text-blue-400"}`}
                        >
                          {formatChange(sector.change_rate)}
                        </span>
                      ) : (
                        width > 85 && (
                          <Expand
                            className="size-3 shrink-0 text-neutral-400 dark:text-neutral-300"
                            aria-hidden="true"
                          />
                        )
                      )}
                    </button>
                    {stocks.map(
                      ({
                        item: stock,
                        x: stockX,
                        y: stockY,
                        width: stockWidth,
                        height: stockHeight,
                      }) => (
                        <div
                          key={stock.code}
                          className="absolute"
                          style={{
                            left: stockX + 1,
                            top: stockY + headerHeight - 2,
                            width: stockWidth,
                            height: stockHeight,
                          }}
                        >
                          {stockTile(stock, stockWidth, stockHeight)}
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-2 max-h-[700px] overflow-auto rounded-xl border border-heatmap-border">
          <table className="w-full min-w-[400px] text-left text-xs">
            <caption className="sr-only">
              표시 종목 목록. 기업을 선택하면 상단 상세 정보가 바뀝니다.
            </caption>
            <thead className="sticky top-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">
                  기업 / 섹터
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  등락률
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  시가총액
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {matchedStocks.map(({ sector, stock }) => (
                <tr
                  key={stock.code}
                  className={
                    activeCode === stock.code
                      ? "bg-neutral-100 dark:bg-neutral-800"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                  }
                >
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setActiveCode(stock.code)}
                      aria-describedby={
                        activeCode === stock.code ? detailId : undefined
                      }
                      className="min-h-10 cursor-pointer text-left outline-offset-2"
                    >
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {stock.name}
                      </span>
                      <span className="mt-1 block text-[11px] text-neutral-500 dark:text-neutral-400">
                        {sector.name} · {stock.code}
                      </span>
                    </button>
                  </th>
                  <td
                    className={`px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums ${stock.change_rate == null || stock.change_rate === 0 ? "text-neutral-500 dark:text-neutral-400" : stock.change_rate > 0 ? "text-red-700 dark:text-red-400" : "text-blue-700 dark:text-blue-400"}`}
                  >
                    {formatChange(stock.change_rate)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-neutral-600 tabular-nums dark:text-neutral-400">
                    {formatKoreanAmount(stock.market_cap)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!matchedStocks.length && (
            <p className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              표시할 검색 결과가 없습니다.
            </p>
          )}
        </div>
      )}
      {displayedSectors.length < 15 && (
        <p className="mt-3 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          시세가 있는 기업 5개 이상인 섹터만 표시합니다. 현재{" "}
          {displayedSectors.length}개 섹터를 확인할 수 있습니다.
        </p>
      )}
      {/* 하단: 표시 종목 수(왼쪽) - 등락 색 범례(오른쪽, 지도 보기에서만) */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">
            표시 종목
          </span>
          <span className="font-medium text-red-700">
            상승 <b className="tabular-nums">{breadth.up}</b>
          </span>
          <span className="font-medium text-blue-700">
            하락 <b className="tabular-nums">{breadth.down}</b>
          </span>
          <span className="text-neutral-500 dark:text-neutral-400">
            보합 <b className="tabular-nums">{breadth.flat}</b>
          </span>
          {breadth.missing > 0 && (
            <span className="text-neutral-500 dark:text-neutral-400">
              미제공 {breadth.missing}
            </span>
          )}
        </div>
        {view === "map" && <HeatmapLegend />}
      </div>
    </div>
  )
}
