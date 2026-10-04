import type { ApiGlossaryTerm, GlossaryCategory } from "@/lib/types/GlossaryType"

// 페이지 상단 "난이도 필터" 칩의 키. 목록을 거르지 않고, 모든 카드의 설명 톤을 한꺼번에 바꾸는 용도다.
// "전체"와 "청년 개미"는 같은 톤(mid)을 쓴다 - 팀 확인 사항: "전체" 기본 톤은 mid로 통일.
export type ToneFilter = "all" | "easy" | "mid" | "hard"

export const TONE_FILTERS: { key: ToneFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "easy", label: "애기 개미" },
  { key: "mid", label: "청년 개미" },
  { key: "hard", label: "고참 개미" },
]

const TONE_FIELD: Record<ToneFilter, keyof ApiGlossaryTerm> = {
  all: "mid_description",
  easy: "easy_description",
  mid: "mid_description",
  hard: "hard_description",
}

/** 선택된 톤 필터에 맞는 설명 문장을 고른다 */
export function descriptionForTone(term: ApiGlossaryTerm, tone: ToneFilter): string {
  return term[TONE_FIELD[tone]] as string
}

/** 로그인한 유저의 등급에 맞는 톤을 기본값으로 고른다. 처음 진입 시 한 번만 쓰인다(설계 단계에서
 * "나중에 붙이기 쉬운 구조로" 요청받은 부분 - 등급 값이 늘어나도 이 매핑만 고치면 된다) */
export function toneForGrade(grade: string): ToneFilter {
  if (grade === "애기 개미") return "easy"
  if (grade === "고참 개미") return "hard"
  return "mid" // 청년 개미 + 알 수 없는 값은 중간 톤
}

// 주제·주체별 카테고리. 배열 순서가 "전체" 화면의 그룹 순서이고, title/subtitle은 그룹 머리에
// 박아 두는 타이틀과 한 줄 설명이다. 백엔드 models/glossary_term.py의 CATEGORIES와 값·순서를 맞출 것
export type GlossaryCategoryInfo = {
  key: GlossaryCategory
  title: string
  subtitle: string
}

export const GLOSSARY_CATEGORIES: GlossaryCategoryInfo[] = [
  {
    key: "시장&지수",
    title: "시장&지수",
    subtitle:
      "코스피·환율·금리·물가처럼 시장 전체의 흐름과 분위기를 보여주는 용어예요.",
  },
  {
    key: "기업 분석&가치 평가",
    title: "기업 분석&가치 평가",
    subtitle:
      "PER·ROE·영업이익처럼 회사가 얼마나 벌고 주가가 비싼지 싼지 따져보는 용어예요.",
  },
  {
    key: "기업 금융&공시",
    title: "기업 금융&공시",
    subtitle:
      "증자·전환사채·배당·상장처럼 회사가 돈을 모으고 나누고 알리는 일에 관한 용어예요.",
  },
  {
    key: "매매 기법&시장 현상",
    title: "매매 기법&시장 현상",
    subtitle:
      "순매수·공매도·차트 신호처럼 사고파는 방법과 그 과정에서 생기는 흐름에 관한 용어예요.",
  },
  {
    key: "제도&매매 안전장치",
    title: "제도&매매 안전장치",
    subtitle:
      "거래 시간·주문 방식·상한가·서킷브레이커처럼 시장의 규칙과 급변동을 막는 장치예요.",
  },
  {
    key: "파생상품&기타 금융",
    title: "파생상품&기타 금융",
    subtitle:
      "옵션·선물·ETF처럼 주식 말고도 시장에서 거래되는 금융상품에 관한 용어예요.",
  },
]

// 카테고리가 비어 있거나(백엔드에 카테고리가 채워지기 전 데이터) 모르는 값인 용어는 목록에서
// 사라지지 않게 맨 끝 "기타" 그룹으로 모은다
const UNCATEGORIZED_GROUP = {
  key: "uncategorized",
  title: "기타",
  subtitle: "아직 카테고리가 정해지지 않은 용어예요.",
} as const

// 카테고리 칩. "전체"는 모든 그룹을 순서대로, 나머지는 해당 그룹 하나만 보여준다
export type CategoryFilter = "all" | GlossaryCategory

export const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "전체" },
  ...GLOSSARY_CATEGORIES.map(({ key, title }) => ({ key, label: title })),
]

export type GlossaryTermGroup = {
  key: string
  title: string
  subtitle: string
  terms: ApiGlossaryTerm[]
}

const KNOWN_CATEGORIES = new Set<string>(GLOSSARY_CATEGORIES.map(({ key }) => key))

/** 용어를 카테고리 그룹으로 묶는다. 그룹은 GLOSSARY_CATEGORIES 순서, 그룹 안은 가나다순.
 * category가 "all"이 아니면 그 그룹 하나만, 용어가 없는 그룹은 뺀다 */
export function groupTermsByCategory(
  terms: ApiGlossaryTerm[],
  category: CategoryFilter
): GlossaryTermGroup[] {
  const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term, "ko"))

  const groups: GlossaryTermGroup[] = GLOSSARY_CATEGORIES.filter(
    ({ key }) => category === "all" || key === category
  ).map((info) => ({
    ...info,
    terms: sorted.filter((term) => term.category === info.key),
  }))

  if (category === "all") {
    groups.push({
      ...UNCATEGORIZED_GROUP,
      terms: sorted.filter(
        (term) => !term.category || !KNOWN_CATEGORIES.has(term.category)
      ),
    })
  }

  return groups.filter((group) => group.terms.length > 0)
}

/** 선택한 카테고리의 타이틀·설명 (용어가 하나도 없어도 머리글은 보여주기 위함) */
export function categoryInfo(category: CategoryFilter): GlossaryCategoryInfo | null {
  return GLOSSARY_CATEGORIES.find(({ key }) => key === category) ?? null
}

/** 검색어로 용어명을 거른다 (대소문자·공백 무시) */
export function matchesQuery(term: ApiGlossaryTerm, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return term.term.toLowerCase().includes(normalized)
}
