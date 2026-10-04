import type { BriefingGlossaryTerm } from "@/lib/types/BriefingType"
import { INNER_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

type BriefingGlossaryProps = {
  terms: BriefingGlossaryTerm[]
}

export default function BriefingGlossary({ terms }: BriefingGlossaryProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-8">
      <p className="text-basic flex items-center gap-1 font-bold text-point2">
        <span aria-hidden>📘</span>
        주린이 1분 금융 용어 사전
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {terms.map((term) => (
          <div
            key={term.term}
            className={cn(INNER_CARD, "flex flex-col gap-1")}
          >
            <span className="text-sm font-semibold">{term.term}</span>
            <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {term.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
