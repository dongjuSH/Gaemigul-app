import type { BriefingContent } from "@/lib/types/BriefingType"
import { Separator } from "../ui"

type BriefingArticleHeaderProps = {
  content: BriefingContent
}

export default function BriefingArticleHeader({
  content,
}: BriefingArticleHeaderProps) {
  return (
    <div className="flex flex-col gap-5 border-b border-neutral-100 dark:border-neutral-700">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1.5 font-semibold text-neutral-500 dark:text-neutral-400">
          <span className="rounded-full bg-point px-1.5 pt-0.5 text-[10px] font-bold text-white">
            {content.tag}
          </span>
          {content.category}
        </span>
        <span className="flex gap-1">
          서비스:
          <span className="font-semibold text-black dark:text-neutral-200">
            개미굴 (Anthill)
          </span>
        </span>
      </div>
      <h1 className="text-xl leading-snug font-extrabold sm:text-3xl">
        {content.title}
      </h1>
      <Separator />
      {/* 모바일: 발행 시각 / 분석을 세로로 쌓고 가운데 구분자(|)는 숨긴다 */}
      <p className="flex items-center gap-4 text-xs text-neutral-400 max-md:flex-col max-md:items-start max-md:gap-1">
        <span>
          발행 시각:{" "}
          <strong className="font-medium text-black dark:text-neutral-200">
            {content.publishedAt}
          </strong>
        </span>
        <span aria-hidden="true" className="max-md:hidden">
          |
        </span>
        <span>
          분석:{" "}
          <strong className="font-medium text-black dark:text-neutral-200">
            {content.analyst}
          </strong>
        </span>
      </p>
      <Separator />
    </div>
  )
}
