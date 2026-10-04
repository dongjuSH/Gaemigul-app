"use client"

import { LogIn } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AuthCard } from "@/components/auth/AuthCard"
import { AuthTextField } from "@/components/auth/AuthTextField"
import { useAuth } from "@/components/common"
import { Button } from "@/components/ui"
import { extractErrorMessage } from "@/lib/api/auth"

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user = await login({ username, password })
      router.push(user.must_change_password ? "/change-password" : "/")
    } catch (submitError) {
      setError(extractErrorMessage(submitError, "로그인에 실패했습니다."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="로그인"
      description="아이디와 비밀번호를 입력해주세요."
      icon={LogIn}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <AuthTextField
          label="아이디"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          placeholder="아이디를 입력해주세요."
          required
        />
        <AuthTextField
          label="비밀번호"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="비밀번호를 입력해주세요."
          required
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button
          type="submit"
          disabled={submitting}
          className="mt-2 h-10 w-full"
        >
          {submitting ? "로그인 중..." : "로그인"}
        </Button>

        <div className="flex justify-center gap-3 text-xs text-muted-foreground">
          <Link
            href="/find-id"
            className="hover:text-foreground hover:underline"
          >
            아이디 찾기
          </Link>
          <span>·</span>
          <Link
            href="/find-password"
            className="hover:text-foreground hover:underline"
          >
            비밀번호 찾기
          </Link>
          <span>·</span>
          <Link
            href="/signup"
            className="hover:text-foreground hover:underline"
          >
            회원가입
          </Link>
        </div>
      </form>
    </AuthCard>
  )
}
