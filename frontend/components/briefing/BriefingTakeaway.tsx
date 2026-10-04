import type { CSSProperties } from "react"

import type { BriefingTakeawayPoint } from "@/lib/types/BriefingType"

type BriefingTakeawayProps = {
  index: string
  items: BriefingTakeawayPoint[]
  /** 섹션별 강조 색상. 지정하지 않으면 기본 포인트 컬러를 사용한다. */
  color?: string
  /** 다크모드에서 카드 배경 위 글자색으로 쓸 때 대신 쓸 밝은 색. 지정 안 하면 color 그대로 쓴다 */
  darkColor?: string
  /** items 중 isChecking인 항목의 "확인 중" 배지에 title 툴팁으로 붙일 안내 문구 */
  reviewMessage?: string
}

export default function BriefingTakeaway({
  index,
  items,
  color = "var(--color-point)",
  darkColor,
  reviewMessage,
}: BriefingTakeawayProps) {
  const accentStyle = {
    "--briefing-accent": color,
    "--briefing-accent-dark": darkColor ?? color,
  } as CSSProperties

  return (
    <div
      style={accentStyle}
      className="relative flex flex-col gap-2 overflow-hidden rounded-lg bg-muted p-4 before:absolute before:top-0 before:left-0 before:h-full before:w-1 before:bg-(--briefing-accent) before:content-['']"
    >
      <p className="flex items-center gap-1.5 text-sm font-bold text-briefing-accent">
        <span aria-hidden>📌</span>
        섹션 {index} 핵심 요약 테이크어웨이
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground"
          >
            • {item.text}
            {item.isChecking && (
              <span
                title={reviewMessage}
                className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              >
                확인 중
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
