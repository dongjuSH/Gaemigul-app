import { format, parseISO } from "date-fns"
import { ko } from "date-fns/locale/ko"

import type {
  ApiReportListItem,
  ApiReportWeekGroup,
  ReportListCardItem,
  ReportWeekSection,
} from "@/lib/types/ReportType"

function formatRangeLabel(startDate: string, endDate: string) {
  return `${format(parseISO(startDate), "M.d")} - ${format(parseISO(endDate), "M.d")}`
}

function mapDailyItem(item: ApiReportListItem): ReportListCardItem {
  const date = parseISO(item.end_date)

  return {
    id: `daily-${item.end_date}`,
    type: "daily",
    date: item.end_date,
    month: format(date, "M월"),
    dateLabel: format(date, "d"),
    unitLabel: format(date, "E", { locale: ko }),
    title: item.title,
    description: item.summary ?? "요약을 준비 중이에요.",
    badgeLabel: "DAY",
  }
}

function mapWeeklyItem(
  item: ApiReportListItem,
  week: ApiReportWeekGroup
): ReportListCardItem {
  return {
    id: `weekly-${item.end_date}`,
    type: "weekly",
    date: item.end_date,
    month: `${week.month}월`,
    dateLabel: String(week.week_of_month),
    unitLabel: "주차",
    title: item.title,
    description: item.summary ?? "요약을 준비 중이에요.",
    badgeLabel: "1 WEEK",
  }
}

/** GET /timeline/reports 응답을 사이드바 주 묶음 목록으로 바꾼다. */
export function mapWeeksToSections(
  weeks: ApiReportWeekGroup[]
): ReportWeekSection[] {
  return weeks.map((week) => ({
    id: `${week.year}-${week.month}-${week.week_of_month}`,
    rangeLabel: formatRangeLabel(week.start_date, week.end_date),
    items: [
      ...(week.weekly ? [mapWeeklyItem(week.weekly, week)] : []),
      ...week.dailies.map(mapDailyItem),
    ],
  }))
}
