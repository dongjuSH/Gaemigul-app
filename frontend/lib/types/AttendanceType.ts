// backend/domain/attendance/schemas/attendance.py와 1:1 대응

export type AttendanceVisitResult = {
  date: string // YYYY-MM-DD
  visited_slots: string[]
  counted: boolean
}

export type AttendanceDay = {
  date: string // YYYY-MM-DD
  visited_slots: string[]
}
