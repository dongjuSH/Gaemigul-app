"use client"

import { cn } from "@/lib/utils"
import { CAT, type NewsItem } from "@/app/(main)/calendar/news-data"

/** 카테고리 색 바 — 항상 해당 카테고리 색으로 표시 */
export function CategoryBar({ category }: { category: NewsItem["category"] }) {
  return (
    <span className={cn("h-3 w-0.5 shrink-0 rounded-full", CAT[category].dot)} />
  )
}
