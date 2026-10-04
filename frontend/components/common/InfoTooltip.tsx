"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Info, type LucideIcon } from "lucide-react"

import { cn, supportsHover } from "@/lib/utils"

type InfoTooltipProps = {
  label: string
  children: React.ReactNode
  className?: string
  icon?: LucideIcon
  iconSize?: number
  buttonClassName?: string
  panelClassName?: string
  // PC(호버 가능한 기기)에서는 화면 우측 고정 대신 버튼 바로 아래에 띄운다.
  anchorBelowOnDesktop?: boolean
}

// 기본적으로 툴팁 패널은 앵커 위치와 무관하게 브라우저 화면 우측에서 16px 띄운 자리에 뜬다.
// (anchorBelowOnDesktop이면 PC에서는 버튼 바로 아래에 뜬다.)
const SCREEN_EDGE_GAP = 16
// 버튼 바로 아래 8px 간격(기존 mt-2와 동일)
const VERTICAL_GAP = 8

export default function InfoTooltip({
  label,
  children,
  className,
  icon: Icon = Info,
  iconSize = 14,
  buttonClassName,
  panelClassName,
  anchorBelowOnDesktop = false,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const [hoverOpen, setHoverOpen] = useState(false)
  const [top, setTop] = useState(0)
  const [left, setLeft] = useState<number | null>(null)
  const [maxSize, setMaxSize] = useState<{ width: number; height: number }>()
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 클릭(모바일 포함)으로 열렸거나, 호버 가능한 기기에서 마우스가 올라가 있으면 보인다.
  const visible = open || hoverOpen

  useEffect(() => {
    setMounted(true)
  }, [])

  const updatePosition = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    // 툴팁 최대 크기 = 실제 화면 크기 - 32px(양쪽 16px씩). 넘치는 내용은 패널 안에서 스크롤된다.
    // 100vw는 모바일 브라우저에 따라 실제 보이는 폭보다 클 수 있어 clientWidth로 직접 잰다.
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.innerHeight
    const maxWidth = viewportWidth - SCREEN_EDGE_GAP * 2
    const maxHeight = viewportHeight - SCREEN_EDGE_GAP * 2
    setMaxSize({ width: maxWidth, height: maxHeight })

    // 버튼 아래에 두되, 아래로 넘치면 화면 하단 16px 안쪽까지 끌어올린다.
    const panelHeight = Math.min(panelRef.current?.offsetHeight ?? 0, maxHeight)
    setTop(
      Math.max(
        SCREEN_EDGE_GAP,
        Math.min(
          rect.bottom + VERTICAL_GAP,
          viewportHeight - panelHeight - SCREEN_EDGE_GAP
        )
      )
    )

    const panelWidth = panelRef.current?.offsetWidth ?? 0
    if (anchorBelowOnDesktop && supportsHover() && panelWidth > 0) {
      // 버튼 중앙 아래에 두되, 화면 좌우 16px 안쪽으로 밀어 넣는다.
      const centered = rect.left + rect.width / 2 - panelWidth / 2
      const maxLeft = viewportWidth - panelWidth - SCREEN_EDGE_GAP
      setLeft(Math.max(SCREEN_EDGE_GAP, Math.min(centered, maxLeft)))
    } else {
      setLeft(null)
    }
  }

  useLayoutEffect(() => {
    if (visible) updatePosition()
  }, [visible])

  useEffect(() => {
    if (!visible) return

    const close = () => {
      setOpen(false)
      setHoverOpen(false)
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        close()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", updatePosition)
    // 스크롤되는 중첩 컨테이너(대장 챗 패널 등)까지 감지하도록 캡처 단계에서 듣는다.
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [visible])

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex shrink-0", className)}
      onMouseEnter={() => {
        // 터치 기기(pointer: coarse)에서는 호버로 열리지 않고 클릭으로만 연다.
        if (supportsHover()) setHoverOpen(true)
      }}
      onMouseLeave={() => setHoverOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={visible}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex size-5 cursor-pointer items-center justify-center rounded-full text-neutral-400 transition-colors duration-200 hover:bg-neutral-100 hover:text-neutral-600",
          buttonClassName
        )}
      >
        <Icon size={iconSize} />
      </button>
      {mounted &&
        createPortal(
          // document.body에 직접 포탈로 그려서, 부모 트리에 transform/필터가 있어도
          // position:fixed가 항상 실제 브라우저 뷰포트 기준으로 동작하게 한다.
          // 등장 효과: 위쪽을 기준점으로 살짝 작고 위에 있다가 ease-bounce로 통통 튀며 제자리로 내려온다.
          // (패널 자신의 scale/translate는 자기 위치 계산(offsetWidth 등)에 영향을 주지 않는다)
          <div
            ref={panelRef}
            className={cn(
              "fixed z-10 w-72 max-w-[calc(100vw-2rem)] origin-top overflow-y-auto rounded-lg border border-border bg-popover p-3 text-[12px] leading-relaxed text-muted-foreground shadow-lg transition-[opacity,scale,translate] duration-300 ease-bounce",
              visible
                ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                : "pointer-events-none -translate-y-1 scale-90 opacity-0",
              panelClassName
            )}
            style={{
              top,
              ...(left === null ? { right: SCREEN_EDGE_GAP } : { left }),
              // 인라인 스타일이라 panelClassName의 고정 폭(w-100 등)보다 우선한다
              maxWidth: maxSize?.width,
              maxHeight: maxSize?.height,
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  )
}
