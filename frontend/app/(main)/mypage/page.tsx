"use client"

import { Footprints, History, Mail, Star, User } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { AttendanceHeatmap } from "@/components/attendance/AttendanceHeatmap"
import { GradeQuizStepper } from "@/components/auth/GradeQuizStepper"
import {
  ConfirmDialog,
  PageTitle,
  useAuth,
  WithdrawReasonDialog,
} from "@/components/common"
import { Badge, Button, Separator, Switch } from "@/components/ui"
import { trackEvent } from "@/lib/analytics"
import {
  changeNickname,
  extractErrorMessage,
  getActivityStats,
  getGradeHistory,
  NICKNAME_MAX_LENGTH,
  setNewsletterOptIn,
  submitWithdrawalFeedback,
} from "@/lib/api/auth"
import {
  getGlossaryFavorites,
  toggleGlossaryFavorite,
} from "@/lib/api/glossary"
import { SECTION_CARD, SECTION_CARD_TITLE } from "@/lib/constant/surface"
import { descriptionForTone, toneForGrade } from "@/lib/glossary"
import type {
  ActivityStats,
  CurrentUser,
  GradeHistoryItem,
} from "@/lib/types/AuthType"
import type { ApiGlossaryTerm } from "@/lib/types/GlossaryType"
import { cn } from "@/lib/utils"

// 닉네임 변경 간격. 백엔드 auth_service.NICKNAME_CHANGE_INTERVAL과 같은 값 (안내 문구용)
const NICKNAME_CHANGE_DAYS = 14

/** "2026-10-11T14:03"(한국 시간) -> "10월 11일 14:03" */
function formatChangeableAt(value: string) {
  const [datePart, timePart = ""] = value.split("T")
  const [, month, day] = datePart.split("-").map(Number)
  return `${month}월 ${day}일 ${timePart.slice(0, 5)}`
}

/** 다음 등급까지 진행 막대 한 줄 */
function ProgressRow({
  label,
  current,
  required,
  unit,
}: {
  label: string
  current: number
  required: number
  unit: string
}) {
  const percent = Math.min(100, Math.round((current / required) * 100))
  const done = current >= required
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className={done ? "font-semibold text-point" : "font-medium"}>
          {current}/{required}
          {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-point transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/** 활동 기반 승급 기준과 지금 진행 상황. 기준은 백엔드 promotion_service.PROMOTION_RULES를 activity-stats로 받는다 */
function GradeProgress({ stats }: { stats: ActivityStats }) {
  // 승급 기준을 아직 안 내려주는 옛 백엔드면(필드 없음) 아무것도 그리지 않는다 - "최고 등급"으로 잘못 보이지 않게
  if (stats.next_grade === undefined) return null
  if (
    !stats.next_grade ||
    stats.required_attendance_days === null ||
    stats.required_distinct_terms === null
  ) {
    return (
      <p className="rounded-lg border px-3 py-2.5 text-xs text-muted-foreground">
        가장 높은 등급이에요. 활동으로 더 오를 등급은 없어요.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border px-3 py-3 text-xs">
      <p className="font-bold">{stats.next_grade}까지</p>
      <ProgressRow
        label={`출석 (최근 ${stats.attendance_window_days}일)`}
        current={stats.attendance_days}
        required={stats.required_attendance_days}
        unit="일"
      />
      <ProgressRow
        label="열람한 용어"
        current={stats.distinct_terms_viewed}
        required={stats.required_distinct_terms}
        unit="개"
      />
    </div>
  )
}

/** 내 정보 카드 (닉네임·등급·이메일·가입일). 닉네임 줄 맨 오른쪽 "수정"을 누르면 닉네임이 입력칸으로 바뀌고
 * 버튼이 "저장"이 된다. 닉네임은 14일에 한 번만 바꿀 수 있다 */
function ProfileCard({
  user,
  onUpdated,
}: {
  user: CurrentUser
  onUpdated: (user: CurrentUser) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(user.nickname)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 값이 없거나(null·옛 백엔드라 필드 없음) 비어 있으면 지금 바로 바꿀 수 있다
  const changeableAt = user.nickname_changeable_at ?? null
  const locked = changeableAt !== null

  const startEditing = () => {
    setValue(user.nickname)
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
  }

  const save = async () => {
    const nickname = value.trim()
    if (nickname === user.nickname) {
      cancel()
      return
    }
    if (!nickname) {
      setError("닉네임을 입력해주세요.")
      return
    }
    if (nickname.length > NICKNAME_MAX_LENGTH) {
      setError(`닉네임은 최대 ${NICKNAME_MAX_LENGTH}자까지 가능합니다.`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      onUpdated(await changeNickname(nickname))
      setEditing(false)
    } catch (saveError) {
      setError(extractErrorMessage(saveError, "닉네임을 바꾸지 못했어요."))
    } finally {
      setSaving(false)
    }
  }

  // 수정 중이거나, 막혀 있거나, 오류가 있을 때만 닉네임 아래 안내를 보여준다
  const helper =
    error ??
    (editing
      ? `최대 ${NICKNAME_MAX_LENGTH}자. 저장하면 ${NICKNAME_CHANGE_DAYS}일 동안 다시 바꿀 수 없어요.`
      : locked
        ? `닉네임은 ${formatChangeableAt(changeableAt as string)}부터 다시 바꿀 수 있어요.`
        : null)

  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-4 py-3">
      <div className="flex min-h-8 items-center gap-2">
        {editing ? (
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save()
              if (event.key === "Escape") cancel()
            }}
            maxLength={NICKNAME_MAX_LENGTH}
            autoFocus
            aria-label="새 닉네임"
            className="h-8 w-40 min-w-0 rounded-md border bg-background px-2 text-sm font-bold outline-offset-2 focus-visible:outline-point max-md:h-11 max-md:text-sm"
          />
        ) : (
          <>
            <span className="min-w-0 truncate font-bold">{user.nickname}</span>
            <Badge className="shrink-0 bg-point3 text-point2">
              {user.grade}
            </Badge>
          </>
        )}
        {editing ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              취소
            </button>
            <Button
              type="button"
              className="h-8 px-3 text-xs"
              onClick={save}
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="ml-auto h-8 shrink-0 px-3 text-xs"
            onClick={startEditing}
            disabled={locked}
            title={
              locked
                ? undefined
                : `닉네임은 ${NICKNAME_CHANGE_DAYS}일에 한 번 바꿀 수 있어요.`
            }
          >
            수정
          </Button>
        )}
      </div>
      {helper && (
        <p
          className={`text-[11px] ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {helper}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {user.email}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          가입일 {user.created_at}
        </span>
      </div>
    </div>
  )
}

/** 서브 페이지(비축 캘린더/개미 용어 사전)와 같은 카드 톤 - 아이콘+제목 헤더가 있는 섹션 */
function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={cn(SECTION_CARD, "flex flex-col gap-4")}>
      <h2 className={SECTION_CARD_TITLE}>
        <Icon size={16} className="text-point" />
        {title}
      </h2>
      {children}
    </div>
  )
}

export default function MyPage() {
  const router = useRouter()
  const { status, user, logout, withdraw, refresh, setUser } = useAuth()

  const [retaking, setRetaking] = useState(false)
  const [activityStats, setActivityStats] = useState<ActivityStats | null>(null)
  const [gradeHistory, setGradeHistory] = useState<GradeHistoryItem[] | null>(
    null
  )
  const [favoriteTerms, setFavoriteTerms] = useState<ApiGlossaryTerm[] | null>(
    null
  )
  // 탈퇴 버튼 -> 사유 선택 -> 최종 확인, 2단계로 진행한다
  const [withdrawStep, setWithdrawStep] = useState<"reason" | "confirm" | null>(
    null
  )
  const [withdrawReason, setWithdrawReason] = useState<{
    reason: string
    customText?: string
  } | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [newsletterConfirmOpen, setNewsletterConfirmOpen] = useState(false)
  const [newsletterUpdating, setNewsletterUpdating] = useState(false)
  // 로그아웃/탈퇴로 직접 나가는 중엔 "/"로 보내고, 이 플래그가 없을 때만(직접 URL 접근 등)
  // 아래 가드가 "/login"으로 보낸다 - 둘 다 같은 status 변화에 반응해서 경합하는 걸 막는다
  const isLoggingOutRef = useRef(false)

  useEffect(() => {
    if (status === "unauthenticated" && !isLoggingOutRef.current)
      router.replace("/login")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    getActivityStats()
      .then(setActivityStats)
      .catch((loadError) => console.error("[getActivityStats] 실패", loadError))
    getGradeHistory()
      .then(setGradeHistory)
      .catch((loadError) => console.error("[getGradeHistory] 실패", loadError))
    getGlossaryFavorites()
      .then(setFavoriteTerms)
      .catch((loadError) =>
        console.error("[getGlossaryFavorites] 실패", loadError)
      )
  }, [status])

  const handleRetakeComplete = async () => {
    await refresh()
    const [stats, history] = await Promise.all([
      getActivityStats(),
      getGradeHistory(),
    ])
    setActivityStats(stats)
    setGradeHistory(history)
    setRetaking(false)
  }

  // 즐겨찾는 용어의 별을 누르면 즐겨찾기를 해제한다 - 목록에서 바로 빼고(낙관적), 실패하면 원래 자리에 되돌린다
  const handleUnfavorite = async (termId: number) => {
    const previous = favoriteTerms
    setFavoriteTerms(
      (current) => current?.filter((term) => term.id !== termId) ?? current
    )
    try {
      const favorited = await toggleGlossaryFavorite(termId)
      // 토글 API라 이미 해제돼 있던 용어였다면 다시 추가됐을 수 있다 - 그 경우 한 번 더 눌러 해제 상태로 맞춘다
      if (favorited) await toggleGlossaryFavorite(termId)
    } catch (error) {
      console.error("[toggleGlossaryFavorite] 실패", error)
      setFavoriteTerms(previous)
    }
  }

  const handleLogout = async () => {
    isLoggingOutRef.current = true
    await logout()
    router.push("/")
  }

  const handleWithdraw = async () => {
    setWithdrawError(null)
    setWithdrawing(true)
    try {
      // 사유 저장은 최선 노력(best-effort)만 한다 - 여기서 실패해도 탈퇴 자체는 막지 않는다
      if (withdrawReason) {
        try {
          await submitWithdrawalFeedback(
            withdrawReason.reason,
            withdrawReason.customText
          )
        } catch (feedbackError) {
          console.error("[submitWithdrawalFeedback] 실패", feedbackError)
        }
      }
      isLoggingOutRef.current = true
      await withdraw()
      router.push("/")
    } catch (submitError) {
      isLoggingOutRef.current = false
      setWithdrawError(extractErrorMessage(submitError, "탈퇴에 실패했습니다."))
    } finally {
      setWithdrawing(false)
    }
  }

  const applyNewsletterOptIn = async (optIn: boolean) => {
    setNewsletterUpdating(true)
    try {
      const updated = await setNewsletterOptIn(optIn)
      setUser(updated)
      if (optIn) trackEvent("newsletter_subscribe", { source: "mypage" })
    } catch (toggleError) {
      console.error("[setNewsletterOptIn] 실패", toggleError)
    } finally {
      setNewsletterUpdating(false)
    }
  }

  const handleNewsletterToggle = (checked: boolean) => {
    if (checked) {
      applyNewsletterOptIn(true)
    } else {
      setNewsletterConfirmOpen(true)
    }
  }

  if (status === "loading" || status === "unauthenticated" || !user) return null

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full flex-col gap-6">
        <PageTitle
          title="마이페이지"
          description="내 정보와 굴 파기 기록을 확인합니다."
        />

        <SectionCard icon={User} title="내 정보">
          {retaking ? (
            <div className="flex flex-col gap-3">
              <GradeQuizStepper
                completeLabel="확인"
                onComplete={handleRetakeComplete}
              />
              <button
                type="button"
                onClick={() => setRetaking(false)}
                className="w-fit text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                취소하고 돌아가기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <ProfileCard user={user} onUpdated={setUser} />

                {/* 등급은 활동(승급 제안)으로 오르거나, 퀴즈 재검사 결과로 바뀐다 - 이용약관 "등급 제도" 조항과 문구를 맞춘다 */}
                {activityStats && <GradeProgress stats={activityStats} />}

                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setRetaking(true)}
                    className="w-fit text-left text-sm text-point hover:underline"
                  >
                    퀴즈로 등급 다시 진단받기
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    회원가입 때와 같은 퀴즈예요. 결과에 따라 등급이 오르거나
                    내려갈 수 있어요.
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <History size={14} />
                    등급 변경 이력
                  </h3>
                  {gradeHistory === null ? (
                    <p className="text-xs text-muted-foreground">
                      불러오는 중...
                    </p>
                  ) : gradeHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      아직 변경 이력이 없어요.
                    </p>
                  ) : (
                    // 이력이 길어져도 칸이 커지지 않게 높이를 고정하고 안에서 스크롤한다
                    <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
                      {gradeHistory.map((item, index) => (
                        <li
                          key={index}
                          className="flex shrink-0 items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-[11px]"
                        >
                          <span className="text-muted-foreground">
                            {item.date}
                          </span>
                          <span className="font-medium">{item.grade}</span>
                          <span className="text-muted-foreground">
                            {item.source}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Separator />

                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Mail size={14} className="text-point" />
                      개미레터 수신
                    </span>
                    <span className="text-xs text-muted-foreground">
                      매주 월요일, 이번주 비축 캘린더 일정을 요약해 보내드려요.
                    </span>
                  </div>
                  <Switch
                    checked={user.newsletter_opt_in}
                    onCheckedChange={handleNewsletterToggle}
                    disabled={newsletterUpdating}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="h-10 w-full"
                    onClick={() => router.push("/change-password")}
                  >
                    비밀번호 변경
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-10 w-full"
                    onClick={handleLogout}
                  >
                    로그아웃
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setWithdrawStep("reason")}
                  className="self-end text-xs text-muted-foreground hover:text-destructive hover:underline"
                >
                  회원 탈퇴
                </button>
              </div>

              {/* 오른쪽 칸: 즐겨찾는 용어. 데스크톱에서는 왼쪽 칸 높이에 맞추고(absolute inset-0) 넘치면 안에서 세로 스크롤 */}
              <div className="relative flex min-h-60 flex-col lg:border-l lg:pl-6">
                <div className="flex max-h-96 flex-col gap-2 lg:absolute lg:inset-0 lg:max-h-none lg:pl-6">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <Star size={14} />
                    즐겨찾는 용어
                    {favoriteTerms && favoriteTerms.length > 0 && (
                      <span className="font-medium text-point">
                        {favoriteTerms.length}개
                      </span>
                    )}
                  </h3>
                  {favoriteTerms === null ? (
                    <p className="text-xs text-muted-foreground">
                      불러오는 중...
                    </p>
                  ) : favoriteTerms.length === 0 ? (
                    <div className="flex flex-col items-start gap-2">
                      <p className="text-xs text-muted-foreground">
                        아직 즐겨찾은 용어가 없어요. 용어 사전에서 별을 눌러
                        저장해보세요!
                      </p>
                      <Link href="/glossary">
                        <Button variant="secondary" className="h-10">
                          개미 용어 사전으로 가기
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                      {favoriteTerms.map((term) => (
                        <li
                          key={term.id}
                          className="flex shrink-0 flex-col gap-0.5 rounded-lg border border-border px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Badge variant="outline" className="w-fit text-xs">
                              {term.term}
                            </Badge>
                            <button
                              type="button"
                              onClick={() => handleUnfavorite(term.id)}
                              aria-label={`${term.term} 즐겨찾기 해제`}
                              aria-pressed
                              className="shrink-0 cursor-pointer text-amber-500 transition-colors hover:text-muted-foreground"
                            >
                              <Star size={16} className="fill-amber-400" />
                            </button>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {descriptionForTone(
                              term,
                              toneForGrade(user?.grade ?? "청년 개미")
                            )}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Footprints} title="굴 파기 기록">
          <p className="-mt-2 text-xs text-muted-foreground">
            시황 타임라인의 각 시간대(하루 8번)에 방문하면 그날 칸이 진해져요.
            지금 이 시간대에 딱 맞춰 들어가야만 기록돼요!
          </p>
          <AttendanceHeatmap />
        </SectionCard>
      </div>

      <WithdrawReasonDialog
        open={withdrawStep === "reason"}
        onCancel={() => setWithdrawStep(null)}
        onNext={(reason, customText) => {
          setWithdrawReason({ reason, customText })
          setWithdrawStep("confirm")
        }}
      />

      <ConfirmDialog
        open={newsletterConfirmOpen}
        title="정말 뉴스레터를 받지 않으시겠어요?"
        description="개미레터를 끄면 매주 월요일 비축 캘린더 요약을 더 이상 보내드리지 않아요. 마이페이지에서 언제든 다시 켤 수 있어요."
        confirmLabel="네, 끌게요"
        cancelLabel="아니오"
        confirming={newsletterUpdating}
        onCancel={() => setNewsletterConfirmOpen(false)}
        onConfirm={async () => {
          await applyNewsletterOptIn(false)
          setNewsletterConfirmOpen(false)
        }}
      />

      <ConfirmDialog
        open={withdrawStep === "confirm"}
        title="정말 개미굴을 나가시겠어요?"
        description={
          withdrawError ??
          "떠나시면 지금까지 쌓은 굴 파기 기록, 용어 열람 기록이 모두 함께 사라져요. 이 작업은 되돌릴 수 없어요."
        }
        confirmLabel="네, 탈퇴할게요"
        cancelLabel="아니오"
        confirming={withdrawing}
        onCancel={() => {
          setWithdrawStep(null)
          setWithdrawError(null)
        }}
        onConfirm={handleWithdraw}
      />
    </div>
  )
}
