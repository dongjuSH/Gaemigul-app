# attendance.py
# 굴 파기 기록(출석 히트맵) 요청/응답 DTO

from pydantic import BaseModel


class RecordVisitRequest(BaseModel):
    slot_key: str


class AttendanceVisitResponse(BaseModel):
    date: str  # YYYY-MM-DD
    visited_slots: list[str]
    # 이번 호출로 실제로 카운트됐는지 - 유효 시간대 밖이거나 이미 그날 카운트된 슬롯이면 false
    counted: bool


class AttendanceDayResponse(BaseModel):
    date: str  # YYYY-MM-DD
    visited_slots: list[str]
