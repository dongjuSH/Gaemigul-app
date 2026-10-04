// ── 백엔드 GET /glossary/terms 응답 DTO (backend/domain/glossary/schemas/glossary_term.py와 1:1 대응) ──
// timeline 도메인의 ApiGlossaryTerm(용어 -> 설명 dict, "오늘의 개미 용어 한 입"용)과는 별개 데이터다.

export type GlossaryDifficulty = "애기 개미" | "청년 개미" | "고참 개미"

// 백엔드 models/glossary_term.py의 CATEGORIES와 값을 맞춘다
export type GlossaryCategory =
  | "시장&지수"
  | "기업 분석&가치 평가"
  | "기업 금융&공시"
  | "매매 기법&시장 현상"
  | "제도&매매 안전장치"
  | "파생상품&기타 금융"

export type ApiGlossaryTerm = {
  id: number
  term: string
  // 이번 "개미 용어 사전" 페이지 UI는 이 값을 쓰지 않는다(향후 카드 배지 기능용으로 미리 내려받아 둠)
  difficulty: GlossaryDifficulty
  // 용어 종류. 백엔드에 컬럼이 추가되기 전 데이터면 null(또는 필드 없음)일 수 있다
  category?: GlossaryCategory | null
  easy_description: string
  mid_description: string
  hard_description: string
  related_terms: string[]
}
