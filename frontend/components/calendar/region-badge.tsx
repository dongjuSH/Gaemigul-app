"use client"

import { cn } from "@/lib/utils"
import { countryCodeOf } from "@/app/(main)/calendar/news-data"

/** 국기 아이콘 — flag-icons 라이브러리(SVG) 사용, OS 이모지 폰트와 무관하게 동일하게 렌더링 */
export function RegionBadge({ region }: { region: string }) {
  const code = countryCodeOf(region)
  return (
    <span
      aria-hidden
      title={region}
      className={cn(
        "fi shrink-0 rounded-xs align-middle ring-1 ring-black/10",
        `fi-${code}`
      )}
      style={{ fontSize: "11px" }}
    />
  )
}
