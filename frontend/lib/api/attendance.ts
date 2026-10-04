// "굴 파기 기록"(출석 히트맵) 백엔드 API(/attendance/*) 클라이언트. 로그인 세션 쿠키가 필요해서
// apiClient(withCredentials)를 쓴다.

import { apiClient } from "@/lib/api/client"
import type { AttendanceDay, AttendanceVisitResult } from "@/lib/types/AttendanceType"

/** 실시간 페로몬의 슬롯 콘텐츠에 진입했을 때 호출. 유효 시간대 밖이거나 이미 카운트된 슬롯이면
 * counted:false로 응답한다(에러 아님) - 호출부에서 굳이 에러 처리할 필요 없음 */
export async function recordSlotVisit(slotKey: string): Promise<AttendanceVisitResult> {
  const response = await apiClient.post<AttendanceVisitResult>("/attendance/visit", { slot_key: slotKey })
  return response.data
}

export async function getAttendanceHeatmap(year: number): Promise<AttendanceDay[]> {
  const response = await apiClient.get<AttendanceDay[]>("/attendance/heatmap", { params: { year } })
  return response.data
}
