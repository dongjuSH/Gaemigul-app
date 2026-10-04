export type BriefingStatTone = "increase" | "decrease" | "positive" | "neutral"

export type BriefingStatCard = {
  label: string
  value: string
  changeLabel?: string
  tone: BriefingStatTone
}

export type BriefingCorrelationPoint = {
  label: string
  fxRate: number
  netSell: number
  highlighted?: boolean
}

export type BriefingCorrelationChart = {
  title: string
  data: BriefingCorrelationPoint[]
  footnoteLeft: string
  footnoteRight: string
}

/** 섹션별 핵심 요약 한 줄. 백엔드가 3개씩 내려준다(ApiReportPointItem). */
export type BriefingTakeawayPoint = {
  /** 리스트 key로 쓰는 안정적인 id - 내용(text)으로 key를 잡으면 같은 문구가 겹칠 때 깨진다 */
  id: string
  text: string
  /** true면 아직 LLM 문구 검수 중 - "확인 중" 배지를 붙인다 */
  isChecking: boolean
}

export type BriefingArticle = {
  id: string
  index: string
  eyebrow: string
  title: string
  body: string
  statCards?: BriefingStatCard[]
  correlationChart?: BriefingCorrelationChart
  /**
   * 이 섹션에 이미지 영역이 있는지를 나타낸다.
   * undefined면 이미지 영역 자체가 없고, null이면 이미지 영역은 있으나 아직 준비되지 않아 기본 이미지를 보여준다.
   */
  imageUrl?: string | null
  takeaways: BriefingTakeawayPoint[]
}

export type BriefingTodoItem = {
  title: string
  description: string
}

export type BriefingGlossaryTerm = {
  term: string
  description: string
}

export type BriefingContent = {
  tag: string
  category: string
  title: string
  publishedAt: string
  analyst: string
  lead: string
  /** 없으면(undefined) 기본 이미지, 있으면 실제 URL을 보여준다. */
  mainImageUrl?: string | null
  todayBriefPoints: BriefingTakeawayPoint[]
  /** "확인 중" 배지가 붙은 포인트에 대해 보여줄 안내 문구 */
  reviewMessage: string
  article: BriefingArticle[]
  noviceSummary: {
    quote: string
    todoItems: BriefingTodoItem[]
  }
  glossary: BriefingGlossaryTerm[]
}
