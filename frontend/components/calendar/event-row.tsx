"use client"

import type { NewsItem } from "@/app/(main)/calendar/news-data"
import { CategoryBar } from "./category-bar"
import { RegionBadge } from "./region-badge"

export function EventRow({
  item,
  onClick,
}: {
  item: NewsItem
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.title}
      className="flex w-full cursor-pointer items-center gap-1 truncate text-left text-[10px] transition-colors hover:text-primary sm:text-[11px]"
    >
      <CategoryBar category={item.category} />
      <RegionBadge region={item.region} />
      <span className="truncate">{item.title}</span>
    </button>
  )
}
