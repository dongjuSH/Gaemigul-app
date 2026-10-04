// "개미 용어 사전" 페이지 전용 백엔드 API(GET /glossary/terms) 클라이언트.
// timeline 도메인의 getTimelineGlossary()(용어 -> 설명 dict, "오늘의 개미 용어 한 입"용)와는
// 별개 엔드포인트다.

import axios from "axios"

import { apiClient } from "@/lib/api/client"
import type { ApiGlossaryTerm, GlossaryCategory } from "@/lib/types/GlossaryType"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000"
const GLOSSARY_TERMS_URL = `${API_BASE_URL.replace(/\/$/, "")}/glossary/terms`

/** GET /glossary/terms?category= — 용어 사전 목록. category를 빼면 전체.
 * 용어사전 페이지는 전체를 받아 검색·톤 전환·카테고리 필터를 프런트에서 처리한다 */
export async function getGlossaryTerms(
  category?: GlossaryCategory
): Promise<ApiGlossaryTerm[]> {
  const response = await axios.get<ApiGlossaryTerm[]>(GLOSSARY_TERMS_URL, {
    params: category ? { category } : undefined,
  })
  return response.data
}

/** POST /glossary/terms/{id}/view — 용어 카드가 화면에 들어오는 순간 호출(로그인 필요, 등급
 * 시스템의 "용어 열람 개수" 활동 점수용). 로그인 안 돼 있으면 401이 나는데 호출부에서 무시한다 */
export async function recordGlossaryTermView(termId: number): Promise<void> {
  await apiClient.post(`/glossary/terms/${termId}/view`)
}

/** GET /glossary/favorites — 로그인한 유저가 즐겨찾은 용어 전체(마이페이지 목록용) */
export async function getGlossaryFavorites(): Promise<ApiGlossaryTerm[]> {
  const response = await apiClient.get<ApiGlossaryTerm[]>("/glossary/favorites")
  return response.data
}

/** POST /glossary/terms/{id}/favorite — 별 버튼 토글(있으면 해제, 없으면 추가). 로그인 필요 */
export async function toggleGlossaryFavorite(termId: number): Promise<boolean> {
  const response = await apiClient.post<{ term_id: number; favorited: boolean }>(
    `/glossary/terms/${termId}/favorite`
  )
  return response.data.favorited
}
