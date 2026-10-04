"use client"

import { UserPlus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AuthCard } from "@/components/auth/AuthCard"
import { AuthTextField } from "@/components/auth/AuthTextField"
import { useAuth } from "@/components/common"
import { Button, Checkbox } from "@/components/ui"
import { trackEvent } from "@/lib/analytics"
import {
  extractErrorMessage,
  NICKNAME_MAX_LENGTH,
  signup,
} from "@/lib/api/auth"

const PASSWORD_HINT = "8자 이상, 영문과 숫자를 모두 포함해주세요."

export default function SignupPage() {
  const router = useRouter()
  const { setUser } = useAuth()

  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [nickname, setNickname] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [newsletterOptIn, setNewsletterOptIn] = useState(false)
  // 가입 성공 직후 바로 온보딩으로 넘기지 않고, 다음 단계를 명확히 안내하는 화면을 한 번 보여준다
  const [signupComplete, setSignupComplete] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password !== passwordConfirm) {
      setError("비밀번호와 비밀번호 확인이 일치하지 않습니다.")
      return
    }
    if (nickname.length > NICKNAME_MAX_LENGTH) {
      setError(`닉네임은 최대 ${NICKNAME_MAX_LENGTH}자까지 가능합니다.`)
      return
    }
    if (!privacyAgreed) {
      setError("개인정보 처리방침에 동의해주세요.")
      return
    }

    setSubmitting(true)
    try {
      const user = await signup({
        email,
        username,
        nickname,
        password,
        password_confirm: passwordConfirm,
        privacy_agreed: privacyAgreed,
        newsletter_opt_in: newsletterOptIn,
      })
      setUser(user)
      setSignupComplete(true)
      if (newsletterOptIn) trackEvent("newsletter_subscribe", { source: "signup" })
    } catch (submitError) {
      setError(extractErrorMessage(submitError, "회원가입에 실패했습니다."))
    } finally {
      setSubmitting(false)
    }
  }

  if (signupComplete) {
    return (
      <AuthCard
        title="회원가입"
        description="가입이 완료됐어요."
        icon={UserPlus}
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            회원가입이 완료됐어요!
            <br />
            다음은 <strong className="text-foreground">등급 진단 퀴즈</strong>
            예요.
          </p>
          <Button
            className="h-10 w-full max-w-xs"
            onClick={() => router.push("/onboarding/grade-quiz")}
          >
            등급 진단 퀴즈 풀러 가기
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="회원가입"
      description="개미굴에서 사용할 정보를 입력해주세요."
      icon={UserPlus}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <AuthTextField
          label="이메일"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="이메일을 입력해주세요. ex)example@gaemigul.com"
          required
        />
        <AuthTextField
          label="아이디"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          placeholder="아이디를 입력해주세요."
          required
        />
        <AuthTextField
          label={`닉네임 (최대 ${NICKNAME_MAX_LENGTH}자)`}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={NICKNAME_MAX_LENGTH}
          placeholder="닉네임을 입력해주세요."
          required
        />
        <AuthTextField
          label="비밀번호"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          placeholder={PASSWORD_HINT}
          required
        />
        <AuthTextField
          label="비밀번호 확인"
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          autoComplete="new-password"
          placeholder="비밀번호를 한 번 더 입력해주세요."
          required
        />

        <div className="flex flex-col gap-2 pt-1">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={privacyAgreed}
              onCheckedChange={(checked) => setPrivacyAgreed(checked === true)}
              required
            />
            <span>
              <Link
                href="/privacy-policy"
                className="underline hover:text-point"
                target="_blank"
              >
                개인정보 처리방침
              </Link>
              에 동의합니다. (필수)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={newsletterOptIn}
              onCheckedChange={(checked) =>
                setNewsletterOptIn(checked === true)
              }
            />
            <span>
              <Link
                href="/newsletter-consent"
                className="underline hover:text-point"
                target="_blank"
              >
                개미레터(뉴스레터) 수신
              </Link>
              에 동의합니다. (선택)
            </span>
          </label>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button
          type="submit"
          disabled={submitting}
          className="mt-2 h-10 w-full"
        >
          {submitting ? "가입 중..." : "다음: 등급 진단 퀴즈"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-foreground hover:underline">
            로그인
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
