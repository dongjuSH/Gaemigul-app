// 인증 도메인 백엔드 API(/auth/*) 클라이언트. backend/domain/auth/routers/auth.py와 1:1 대응.

import axios from "axios"

import { apiClient } from "@/lib/api/client"
import type {
  ActivityStats,
  ChangePasswordPayload,
  CurrentUser,
  GradeHistoryItem,
  GradeQuiz,
  GradeSurveyPayload,
  GradeSurveyResult,
  LoginPayload,
  PromotionSuggestion,
  SignupPayload,
} from "@/lib/types/AuthType"

export async function signup(payload: SignupPayload): Promise<CurrentUser> {
  const response = await apiClient.post<CurrentUser>("/auth/signup", payload)
  return response.data
}

export async function login(payload: LoginPayload): Promise<CurrentUser> {
  const response = await apiClient.post<CurrentUser>("/auth/login", payload)
  return response.data
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout")
}

/** 회원 탈퇴 - 계정과 연관 데이터(출석 기록, 용어 열람 기록 등)를 모두 삭제한다. 되돌릴 수 없다 */
export async function withdraw(): Promise<void> {
  await apiClient.delete("/auth/me")
}

export const WITHDRAWAL_REASON_OPTIONS = [
  "서비스를 잘 안 쓰게 돼서",
  "원하는 정보가 없어서",
  "다른 서비스를 써서",
  "기타",
] as const

/** 탈퇴 사유(익명 통계, 계정과 무관하게 저장됨) - 탈퇴 처리 전에 호출한다 */
export async function submitWithdrawalFeedback(
  reason: string,
  customText?: string
): Promise<void> {
  await apiClient.post("/auth/withdrawal-feedback", {
    reason,
    custom_text: customText ?? null,
  })
}

/** 로그인 안 되어 있으면 null (401을 에러로 던지지 않고 null로 반환) */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const response = await apiClient.get<CurrentUser>("/auth/me")
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) return null
    throw error
  }
}

export async function findId(email: string): Promise<string> {
  const response = await apiClient.post<{ message: string }>("/auth/find-id", {
    email,
  })
  return response.data.message
}

export async function resetPassword(
  username: string,
  email: string
): Promise<string> {
  const response = await apiClient.post<{ message: string }>(
    "/auth/reset-password",
    { username, email }
  )
  return response.data.message
}

export async function verifyPassword(password: string): Promise<void> {
  await apiClient.post("/auth/verify-password", { password })
}

export async function changePassword(
  payload: ChangePasswordPayload
): Promise<string> {
  const response = await apiClient.post<{ message: string }>(
    "/auth/change-password",
    payload
  )
  return response.data.message
}

export async function submitGradeSurvey(
  payload: GradeSurveyPayload
): Promise<GradeSurveyResult> {
  const response = await apiClient.post<GradeSurveyResult>(
    "/auth/grade-survey",
    payload
  )
  return response.data
}

export async function getGradeQuiz(): Promise<GradeQuiz> {
  const response = await apiClient.get<GradeQuiz>("/auth/grade-quiz")
  return response.data
}

export async function getGradeHistory(): Promise<GradeHistoryItem[]> {
  const response = await apiClient.get<GradeHistoryItem[]>(
    "/auth/grade-history"
  )
  return response.data
}

export async function getActivityStats(): Promise<ActivityStats> {
  const response = await apiClient.get("/auth/activity-stats")
  return response.data
}

/** 대기 중인 승급 제안이 없으면 null */
export async function getPromotionSuggestion(): Promise<PromotionSuggestion | null> {
  const response = await apiClient.get<PromotionSuggestion | null>(
    "/auth/promotion-suggestion"
  )
  return response.data
}

export async function respondToPromotionSuggestion(
  id: number,
  accept: boolean
): Promise<CurrentUser> {
  const response = await apiClient.post<CurrentUser>(
    `/auth/promotion-suggestion/${id}/respond`,
    { accept }
  )
  return response.data
}

/** 닉네임 최대 길이. 백엔드 schemas/auth.py의 NICKNAME_MAX_LENGTH와 같은 값이어야 한다 */
export const NICKNAME_MAX_LENGTH = 8

/** 마이페이지 - 닉네임 변경. 14일에 한 번만 되고, 막히면 400(detail에 다시 바꿀 수 있는 시각) */
export async function changeNickname(nickname: string): Promise<CurrentUser> {
  const response = await apiClient.patch<CurrentUser>("/auth/nickname", {
    nickname,
  })
  return response.data
}

/** 마이페이지 - 개미레터(뉴스레터) 수신 동의 on/off */
export async function setNewsletterOptIn(optIn: boolean): Promise<CurrentUser> {
  const response = await apiClient.patch<CurrentUser>(
    "/auth/newsletter-opt-in",
    { opt_in: optIn }
  )
  return response.data
}

/** 백엔드 에러 응답(detail)에서 사람이 읽을 메시지를 뽑아낸다. FastAPI 검증 에러(422)는
 * detail이 배열 형태라 그 경우엔 첫 항목의 msg를 쓴다 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback

  const detail = error.response?.data?.detail
  if (typeof detail === "string") return detail
  if (
    Array.isArray(detail) &&
    detail.length > 0 &&
    typeof detail[0]?.msg === "string"
  ) {
    return detail[0].msg
  }
  return fallback
}
