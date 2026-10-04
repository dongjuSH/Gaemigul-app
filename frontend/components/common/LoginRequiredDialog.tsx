"use client"

import { X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { Button } from "@/components/ui"

/** 로그인이 필요한 기능(용어 즐겨찾기 등)을 비로그인 상태에서 눌렀을 때 띄우는 안내 팝업.
 * 바깥 영역·X 버튼·Esc로 닫는다 */
export function LoginRequiredDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const goTo = (path: string) => {
    onClose()
    router.push(path)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-required-title"
        className="relative w-full max-w-sm rounded-xl bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>

        <p id="login-required-title" className="text-base font-bold">
          로그인이 필요한 기능입니다.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">로그인을 해주세요.</p>

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-10 flex-1"
            onClick={() => goTo("/signup")}
          >
            회원가입
          </Button>
          <Button
            type="button"
            className="h-10 flex-1"
            autoFocus
            onClick={() => goTo("/login")}
          >
            로그인
          </Button>
        </div>
      </div>
    </div>
  )
}
