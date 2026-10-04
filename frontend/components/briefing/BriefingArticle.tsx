import type { CSSProperties } from "react"

import type { BriefingArticle as BriefingArticleType } from "@/lib/types/BriefingType"
import { getBriefingAccentColor, getBriefingAccentTextDarkColor } from "./accentColors"
import BriefingCorrelationChart from "./BriefingCorrelationChart"
import BriefingImage from "./BriefingImage"
import BriefingStatCards from "./BriefingStatCards"
import BriefingTakeaway from "./BriefingTakeaway"

import { Separator } from "../ui"
import { INNER_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

type BriefingArticleProps = {
  /** 0-based 순서. 강조 색상을 순환 선택하는 데 사용한다. */
  id: number
  article: BriefingArticleType
  /** takeaways 중 "확인 중" 배지에 붙일 안내 문구 */
  reviewMessage?: string
}

export default function BriefingArticle({ id, article, reviewMessage }: BriefingArticleProps) {
  const accentColor = getBriefingAccentColor(id)
  const accentTextDarkColor = getBriefingAccentTextDarkColor(id)
  const accentStyle = {
    "--briefing-accent": accentColor,
    "--briefing-accent-dark": accentTextDarkColor,
  } as CSSProperties

  return (
    <article
      id={article.id}
      style={accentStyle}
      className={cn(INNER_CARD, "flex scroll-mt-24 flex-col gap-4")}
    >
      {/* 모바일: 제목이 두 줄이 돼도 번호가 위에 붙고(items-start), 번호 칸은 줄어들지 않는 정사각형 */}
      <div className="flex items-center gap-2 max-md:items-start">
        <span className="text-baisc flex size-9 items-center justify-center rounded-md bg-(--briefing-accent) font-bold text-white max-md:shrink-0">
          {article.index}
        </span>
        <h2 className="text-basic flex flex-col font-bold text-card-foreground">
          <span className="text-xs font-semibold text-briefing-accent">
            {article.eyebrow}
          </span>
          {article.title}
        </h2>
      </div>
      <Separator className="bg-border/50" />
      <p className="text-sm leading-relaxed text-card-foreground">{article.body}</p>

      {article.imageUrl !== undefined && (
        <BriefingImage url={article.imageUrl} alt={article.title} />
      )}

      {article.statCards && <BriefingStatCards cards={article.statCards} />}
      {article.correlationChart && (
        <BriefingCorrelationChart chart={article.correlationChart} />
      )}

      <BriefingTakeaway
        index={article.index}
        items={article.takeaways}
        color={accentColor}
        darkColor={accentTextDarkColor}
        reviewMessage={reviewMessage}
      />
    </article>
  )
}
