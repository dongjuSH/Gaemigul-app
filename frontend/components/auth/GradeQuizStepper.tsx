"use client"

import { useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/common"
import { Button } from "@/components/ui"
import { trackEvent } from "@/lib/analytics"
import { extractErrorMessage, getGradeQuiz, submitGradeSurvey } from "@/lib/api/auth"
import type { GradeQuiz, GradeSurveyResult, InvestmentExperience, QuizAnswers } from "@/lib/types/AuthType"

const EXPERIENCE_OPTIONS: InvestmentExperience[] = ["없음", "1년 미만", "1년 이상"]

type Step =
  | { kind: "experience" }
  | { kind: "term"; id: string; question: string; choices: string[] }
  | { kind: "news"; id: string; question: string; choices: string[] }

/**
 * 등급 판정 퀴즈 - 한 문제씩 스텝으로 넘어가며 진행한다(회원가입 직후 온보딩 페이지와
 * 마이페이지 "등급 재검사"가 이 컴포넌트를 그대로 재사용한다).
 * onComplete: 결과 화면에서 확인 버튼을 눌렀을 때 호출 - 호출부가 다음 이동을 결정한다.
 */
export function GradeQuizStepper({
  onComplete,
  completeLabel = "확인",
}: {
  onComplete: () => void
  completeLabel?: string
}) {
  const { user } = useAuth()
  const [quiz, setQuiz] = useState<GradeQuiz | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [investmentExperience, setInvestmentExperience] = useState<InvestmentExperience | null>(null)
  const [termAnswers, setTermAnswers] = useState<QuizAnswers>({})
  const [newsAnswers, setNewsAnswers] = useState<QuizAnswers>({})
  const [result, setResult] = useState<GradeSurveyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getGradeQuiz()
      .then(setQuiz)
      .catch((loadError) => console.error("[getGradeQuiz] 실패", loadError))
  }, [])

  // 중간 저장은 없다 - 답변 도중 새로고침/탭 닫기/URL 이동을 하면 처음부터 다시 해야 하므로
  // 브라우저 기본 이탈 확인창을 띄운다. 아직 아무것도 안 골랐거나(첫 진입) 결과 화면에서는 안 띄운다
  const hasProgress =
    investmentExperience !== null || Object.keys(termAnswers).length > 0 || Object.keys(newsAnswers).length > 0

  useEffect(() => {
    if (result || !hasProgress) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [result, hasProgress])

  const steps: Step[] = useMemo(() => {
    if (!quiz) return [{ kind: "experience" }]
    return [
      { kind: "experience" },
      ...quiz.term_questions.map((q) => ({ kind: "term" as const, id: q.id, question: q.question, choices: q.choices })),
      ...quiz.news_questions.map((q) => ({ kind: "news" as const, id: q.id, question: q.question, choices: q.choices })),
    ]
  }, [quiz])

  const currentStep = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1

  const isCurrentStepAnswered = (() => {
    if (!currentStep) return false
    if (currentStep.kind === "experience") return investmentExperience !== null
    if (currentStep.kind === "term") return termAnswers[currentStep.id] !== undefined
    return newsAnswers[currentStep.id] !== undefined
  })()

  const handleNext = async () => {
    if (!isLastStep) {
      setStepIndex((prev) => prev + 1)
      return
    }
    if (!investmentExperience) return

    setError(null)
    setSubmitting(true)
    try {
      const surveyResult = await submitGradeSurvey({
        investment_experience: investmentExperience,
        term_quiz_answers: termAnswers,
        news_quiz_answers: newsAnswers,
      })
      setResult(surveyResult)
      trackEvent("grade_quiz_complete", { grade: surveyResult.grade })
    } catch (submitError) {
      setError(extractErrorMessage(submitError, "제출에 실패했습니다."))
    } finally {
      setSubmitting(false)
    }
  }

  const handlePrev = () => setStepIndex((prev) => Math.max(0, prev - 1))

  if (result) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <p className="text-base leading-relaxed">
          <strong>{user?.nickname}</strong>님은 총{" "}
          <strong className="text-point">{result.total_correct}점</strong>
          {` (${result.total_questions}문제 중)`}
          !
          <br />
          등급은 <strong className="text-point">{result.grade}</strong>입니다.
        </p>
        <Button onClick={onComplete} className="h-10 w-full max-w-xs">
          {completeLabel}
        </Button>
      </div>
    )
  }

  if (!quiz || !currentStep) {
    return <p className="py-8 text-center text-sm text-muted-foreground">퀴즈를 불러오는 중이에요...</p>
  }

  const progressPercent = Math.round(((stepIndex + 1) / steps.length) * 100)

  return (
    <div className="flex flex-col gap-5">
      {stepIndex === 0 && (
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          정확한 순위를 매기는 게 아니라, 용어 설명을 딱 눈높이에 맞게 보여드리기 위한 거예요.
          편하게 답해주세요!
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {stepIndex + 1}/{steps.length}번 문제
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-point transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          진행 중 나가거나 새로고침하면 저장되지 않아요 - 처음부터 다시 진행해야 해요.
        </p>
      </div>

      {currentStep.kind === "experience" ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-700">주식 투자 경험이 있으신가요?</span>
          <div className="flex flex-col gap-1.5">
            {EXPERIENCE_OPTIONS.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="investment_experience"
                  checked={investmentExperience === option}
                  onChange={() => setInvestmentExperience(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-700">{currentStep.question}</span>
          <div className="flex flex-col gap-1.5">
            {currentStep.choices.map((choice, choiceIndex) => {
              const answers = currentStep.kind === "term" ? termAnswers : newsAnswers
              const setAnswers = currentStep.kind === "term" ? setTermAnswers : setNewsAnswers
              return (
                <label key={choiceIndex} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={currentStep.id}
                    checked={answers[currentStep.id] === choiceIndex}
                    onChange={() => setAnswers((prev) => ({ ...prev, [currentStep.id]: choiceIndex }))}
                  />
                  {choice}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        {stepIndex > 0 && (
          <Button type="button" variant="secondary" onClick={handlePrev} className="h-10 flex-1">
            이전
          </Button>
        )}
        <Button
          type="button"
          disabled={!isCurrentStepAnswered || submitting}
          onClick={handleNext}
          className="h-10 flex-1"
        >
          {submitting ? "제출 중..." : isLastStep ? "결과 보기" : "다음"}
        </Button>
      </div>
    </div>
  )
}
