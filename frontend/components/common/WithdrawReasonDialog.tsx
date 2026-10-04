"use client"

import { useState } from "react"

import { Button } from "@/components/ui"
import { WITHDRAWAL_REASON_OPTIONS } from "@/lib/api/auth"

const OTHER_REASON = "기타"

/** 회원 탈퇴 확인 팝업 앞에 한 번 거치는 사유 선택 단계 - 익명 통계용(계정과 무관하게 저장됨) */
export function WithdrawReasonDialog({
  open,
  onCancel,
  onNext,
}: {
  open: boolean
  onCancel: () => void
  onNext: (reason: string, customText?: string) => void
}) {
  const [reason, setReason] = useState<string | null>(null)
  const [customText, setCustomText] = useState("")

  if (!open) return null

  const canProceed = reason !== null && (reason !== OTHER_REASON || customText.trim().length > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl">
        <p className="text-base font-bold">떠나시는 이유를 알려주시겠어요?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          더 나은 서비스를 위한 익명 통계로만 쓰이고, 탈퇴 계정과는 연결되지 않아요.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {WITHDRAWAL_REASON_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="withdrawal_reason"
                checked={reason === option}
                onChange={() => setReason(option)}
              />
              {option}
            </label>
          ))}
          {reason === OTHER_REASON && (
            <input
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="어떤 점이 아쉬우셨는지 알려주세요"
              className="h-10 rounded-lg border bg-background px-3 text-sm outline-offset-2 placeholder:text-muted-foreground focus-visible:outline-point max-md:h-11 max-md:text-sm"
            />
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" className="h-10 flex-1" onClick={onCancel}>
            아니오
          </Button>
          <Button
            type="button"
            className="h-10 flex-1"
            disabled={!canProceed}
            onClick={() => reason && onNext(reason, reason === OTHER_REASON ? customText.trim() : undefined)}
          >
            다음
          </Button>
        </div>
      </div>
    </div>
  )
}
