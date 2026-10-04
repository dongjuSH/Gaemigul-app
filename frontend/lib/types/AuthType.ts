// backend/domain/auth/schemas/auth.py와 1:1 대응

export type InvestmentExperience = "없음" | "1년 미만" | "1년 이상"

export type CurrentUser = {
  id: number
  email: string
  username: string
  nickname: string
  grade: string
  must_change_password: boolean
  newsletter_opt_in: boolean
  created_at: string // YYYY-MM-DD
  // 닉네임을 다시 바꿀 수 있는 시각(한국 시간 "YYYY-MM-DDTHH:MM"). 지금 바로 바꿀 수 있으면 null
  nickname_changeable_at: string | null
}

// GET /auth/activity-stats - 마이페이지 "다음 등급까지" 진행 상황. 최고 등급이면 next_grade·required_* 가 null
export type ActivityStats = {
  attendance_days: number // 최근 attendance_window_days일 중 출석한 날
  distinct_terms_viewed: number // 지금까지 열람한 서로 다른 용어 수
  attendance_window_days: number
  next_grade: string | null
  required_attendance_days: number | null
  required_distinct_terms: number | null
}

// {문항 id: 고른 선택지 인덱스} - backend quiz_service.score()가 채점
export type QuizAnswers = Record<string, number>

// 회원가입은 기본 정보만 받는다 - 등급 퀴즈는 가입 후 별도 온보딩 페이지에서 진행
export type SignupPayload = {
  email: string
  username: string
  nickname: string
  password: string
  password_confirm: string
  privacy_agreed: boolean
  newsletter_opt_in: boolean
}

export type LoginPayload = {
  username: string
  password: string
}

export type ChangePasswordPayload = {
  current_password: string
  new_password: string
  new_password_confirm: string
}

export type GradeSurveyPayload = {
  investment_experience: InvestmentExperience
  term_quiz_answers: QuizAnswers
  news_quiz_answers: QuizAnswers
}

export type QuizQuestion = {
  id: string
  question: string
  choices: string[]
}

export type GradeQuiz = {
  term_questions: QuizQuestion[]
  news_questions: QuizQuestion[]
}

export type PromotionSuggestion = {
  id: number
  suggested_grade: string
  attendance_days: number
  distinct_terms_viewed: number
}

export type GradeSurveyResult = {
  grade: string
  total_correct: number
  total_questions: number
}

export type GradeHistoryItem = {
  date: string // YYYY-MM-DD
  grade: string
  source: string // "퀴즈" | "활동 승급"
}
