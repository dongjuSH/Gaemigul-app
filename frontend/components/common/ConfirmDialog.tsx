"use client"

import { Button } from "@/components/ui"

/** 간단한 확인/취소 팝업 - 회원 탈퇴처럼 되돌릴 수 없는 작업 전에 한 번 더 확인받을 때 쓴다 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "네",
  cancelLabel = "아니오",
  confirming = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl">
        <p className="text-base font-bold">{title}</p>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" className="h-10 flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 flex-1"
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? "처리 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
