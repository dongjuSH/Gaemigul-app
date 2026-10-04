"use client"

import { KeyRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { AuthCard } from "@/components/auth/AuthCard"
import { AuthTextField } from "@/components/auth/AuthTextField"
import { useAuth } from "@/components/common"
import { Button } from "@/components/ui"
import { changePassword, extractErrorMessage, verifyPassword } from "@/lib/api/auth"

const PASSWORD_HINT = "8자 이상, 영문과 숫자를 모두 포함해주세요."

export default function ChangePasswordPage() {
  const router = useRouter()
  const { status, user, refresh } = useAuth()

  // 1) 현재 비밀번호 입력 -> 2) 서버 확인 -> 3) 확인되면 새 비밀번호 입력칸 노출 (문서 3-7 흐름)
  const [currentPassword, setCurrentPassword] = useState("")
  const [currentPasswordVerified, setCurrentPasswordVerified] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login")
  }, [status, router])

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await verifyPassword(currentPassword)
      setCurrentPasswordVerified(true)
    } catch (submitError) {
      setError(extractErrorMessage(submitError, "확인에 실패했습니다."))
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (newPassword !== newPasswordConfirm) {
      setError("새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.")
      return
    }

    setSubmitting(true)
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      })
      await refresh() // must_change_password 플래그가 풀렸다는 걸 전역 상태에도 반영
      setDone(true)
    } catch (submitError) {
      setError(extractErrorMessage(submitError, "비밀번호 변경에 실패했습니다."))
    } finally {
      setSubmitting(false)
    }
  }

  if (status === "loading" || status === "unauthenticated") return null

  return (
    <AuthCard
      title="비밀번호 변경"
      description={
        user?.must_change_password
          ? "임시 비밀번호로 로그인하셨어요. 계속 이용하려면 비밀번호를 변경해주세요."
          : undefined
      }
      icon={KeyRound}
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            비밀번호가 변경되었습니다.
          </p>
          <Button className="h-10 w-full" onClick={() => router.push("/mypage")}>
            마이페이지로 이동
          </Button>
        </div>
      ) : !currentPasswordVerified ? (
        <form className="flex flex-col gap-4" onSubmit={handleVerify}>
          <AuthTextField
            label="현재 비밀번호"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="현재 사용 중인 비밀번호"
            required
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={submitting} className="mt-2 h-10 w-full">
            {submitting ? "확인 중..." : "확인"}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleChange}>
          <AuthTextField label="현재 비밀번호" type="password" value={currentPassword} disabled />
          <AuthTextField
            label="새 비밀번호"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            placeholder={PASSWORD_HINT}
            required
          />
          <AuthTextField
            label="새 비밀번호 확인"
            type="password"
            value={newPasswordConfirm}
            onChange={(event) => setNewPasswordConfirm(event.target.value)}
            autoComplete="new-password"
            placeholder="새 비밀번호를 한 번 더 입력해주세요"
            required
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={submitting} className="mt-2 h-10 w-full">
            {submitting ? "변경 중..." : "새 비밀번호로 변경"}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
