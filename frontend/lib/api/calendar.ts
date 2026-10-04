// 경제 캘린더 백엔드 API(GET /calendar/events) 클라이언트.
// 응답 스키마는 backend/src/backend/domain/calendar/schemas/calendar.py의
// CalendarEvent(Pydantic)와 필드명을 동일하게 유지한다.

import axios from "axios"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000"
const CALENDAR_EVENTS_URL = `${API_BASE_URL.replace(/\/$/, "")}/calendar/events`

export interface CalendarEventDto {
  id: string
  // 발표 날짜(YYYY-MM-DD, 한국시간 기준)
  publishedAt: string
  // 다일 이벤트용 - 단일 발표 지표에서는 항상 null
  start_date: string | null
  end_date: string | null
  // 발표 시각(HH:mm, 한국시간). 확인 안 되면 null
  time: string | null
  region: string
  category: string
  title: string
  summary: string
  // FRED가 표준 중요도를 제공하지 않아 현재 항상 null
  importance: number | null
  previous: string | null
  actual: string | null
  // actual이 구체적으로 무엇에 대한 값인지 알려주는 짧은 라벨(예: "공모가", "주당", "매출액")
  actual_label: string | null
  status: string
}

/** 해당 연/월(year, month: 1~12)에 발표되는 경제 캘린더 이벤트 목록 조회 */
export async function getCalendarEvents(
  year: number,
  month: number
): Promise<CalendarEventDto[]> {
  const response = await axios.get<CalendarEventDto[]>(CALENDAR_EVENTS_URL, {
    params: { year, month },
  })

  if (!Array.isArray(response.data)) {
    throw new Error("캘린더 API 응답 형식이 올바르지 않습니다.")
  }

  return response.data
}
