"use client"

import { ArrowUp } from "lucide-react"

/**
 * 우측 하단 "맨 위로" 플로팅 버튼. 대장 챗 토글(WhisperChat) 바로 아래에 같은 크기로 항상 떠 있다.
 * 모바일(sm 미만)에서는 50px, 그 이상에서는 56px.
 * 포인트 색 대신 그레이 계열을 써서 대장 챗 버튼과 구분하고, 다크모드 색도 따로 맞춘다.
 */
export function ScrollTopButton() {
  const scrollToTop = () => {
    // 움직임 줄이기 설정을 켠 사용자는 애니메이션 없이 바로 올린다
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="맨 위로 이동"
      className="fixed right-3 bottom-4 z-50 flex size-[50px] cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-lg transition-colors duration-200 hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 sm:size-14 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-white"
    >
      <ArrowUp size={24} />
    </button>
  )
}
