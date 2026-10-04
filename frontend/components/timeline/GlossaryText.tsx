"use client"

import { Fragment, useEffect, useRef, useState } from "react"

import { cn, supportsHover } from "@/lib/utils"

type GlossaryTextProps = {
  text: string
  /** GET /glossary/terms를 {용어: 설명}으로 변환한 값(설명은 로그인 여부·등급별 톤으로 이미
   * 골라져 있다 - app/(main)/timeline/page.tsx 참고). 없으면 원문 그대로 보여준다. */
  glossary: Record<string, string>
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** 용어 하나 - 호버 가능한 기기에서는 호버로, 모바일 등 터치 기기에서는 클릭으로 설명을 띄운다. */
function GlossaryTerm({
  term,
  description,
}: {
  term: string
  description: string
}) {
  const [open, setOpen] = useState(false)
  const [hoverOpen, setHoverOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  const visible = open || hoverOpen

  useEffect(() => {
    if (!visible) return

    const close = () => {
      setOpen(false)
      setHoverOpen(false)
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [visible])

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={() => setOpen((prev) => !prev)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          setOpen((prev) => !prev)
        }
      }}
      onMouseEnter={() => {
        // 터치 기기(pointer: coarse)에서는 호버로 열리지 않고 클릭으로만 연다.
        if (supportsHover()) setHoverOpen(true)
      }}
      onMouseLeave={() => setHoverOpen(false)}
      className="relative inline-block cursor-help rounded bg-point/10 px-0.5 text-point"
    >
      {term}
      {/* 용어 아래쪽(말풍선 꼬리 쪽)을 기준점으로 작게 접혀 있다가, ease-bounce로 통통 튀며 커져 올라온다 */}
      <span
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-56 max-w-[calc(100vw-2rem)] origin-bottom -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-[11px] leading-relaxed font-normal text-popover-foreground shadow-lg transition-[opacity,scale,translate] duration-300 ease-bounce",
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-1 scale-75 opacity-0"
        )}
      >
        {description}
      </span>
    </span>
  )
}

/** 본문 중 용어 사전에 있는 단어에만 연한 배경을 주고, 설명을 띄운다. */
export default function GlossaryText({ text, glossary }: GlossaryTextProps) {
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length)

  if (!text || terms.length === 0) return <>{text}</>

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "g")
  const parts = text.split(pattern)
  // 같은 카드(하나의 GlossaryText) 안에서는 같은 단어를 두 번째부터 강조하지 않는다.
  const seen = new Set<string>()

  return (
    <>
      {parts.map((part, index) => {
        const description = glossary[part]

        if (!description || seen.has(part)) {
          return <Fragment key={index}>{part}</Fragment>
        }
        seen.add(part)

        return <GlossaryTerm key={index} term={part} description={description} />
      })}
    </>
  )
}
