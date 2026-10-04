import type { BriefingContent } from "@/lib/types/BriefingType"
import { BriefingGlossary } from "@/components/briefing"

import { Separator } from "../ui"
import { INNER_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

type BriefingNoviceSummaryProps = {
  summary: BriefingContent["noviceSummary"]
  glossary: BriefingContent["glossary"]
}

export default function BriefingNoviceSummary({
  summary,
  glossary,
}: BriefingNoviceSummaryProps) {
  return (
    <article
      id="article-04"
      className={cn(INNER_CARD, "flex scroll-mt-24 flex-col gap-4")}
    >
      {/* 모바일: 제목이 두 줄이 돼도 번호가 위에 붙고(items-start), 번호 칸은 줄어들지 않는 정사각형 */}
      <div className="flex items-center gap-2 max-md:items-start">
        <span className="text-baisc flex size-9 items-center justify-center rounded-md bg-point2 font-bold text-white max-md:shrink-0">
          04
        </span>
        <h2 className="text-basic flex flex-col font-bold text-card-foreground">
          <span className="text-xs font-semibold text-point2">
            ANTHILL NOVICE SUMMARY
          </span>
          초보 개미도 30초 안에 이해하는 한 줄 결론!
        </h2>
      </div>
      <Separator className="bg-border/50" />

      <p className="text-sm leading-relaxed whitespace-pre-line text-card-foreground">
        {summary.quote}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-card-foreground">
          ⚡ 지금 뭘 해야 하나요? 딱 이것만 외우세요!
        </p>
        <ol className="flex flex-col gap-3">
          {summary.todoItems.map((item, index) => (
            <li
              key={item.title}
              className="flex gap-3 rounded-lg border border-border p-3"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-point text-xs font-bold text-white">
                {index + 1}
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-card-foreground">{item.title}</p>
                <p className="text-xs leading-relaxed text-neutral-500">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {glossary.length > 0 && <BriefingGlossary terms={glossary} />}
    </article>
  )
}
