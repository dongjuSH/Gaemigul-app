import axios from "axios"

import type {
  ApiReportListResponse,
  ApiReportResponse,
} from "@/lib/types/ReportType"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000"
const TIMELINE_URL = `${API_BASE_URL.replace(/\/$/, "")}/timeline`

export type ReportKind = "daily" | "weekly"

/** GET /timeline/reports?year=&month= — 브리핑 사이드바 월별 목록. */
export async function getReportList(
  year: number,
  month: number
): Promise<ApiReportListResponse> {
  const response = await axios.get<ApiReportListResponse>(
    `${TIMELINE_URL}/reports`,
    { params: { year, month } }
  )

  return response.data
}

/** GET /timeline/report?type=&date= — 보고서 상세. 없으면 null. */
export async function getReport(
  type: ReportKind,
  date: string
): Promise<ApiReportResponse | null> {
  const response = await axios.get<ApiReportResponse | null>(
    `${TIMELINE_URL}/report`,
    { params: { type, date } }
  )

  return response.data
}
