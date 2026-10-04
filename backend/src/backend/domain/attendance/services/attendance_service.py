# attendance_service.py
# "굴 파기 기록" 핵심 로직 - 슬롯 진입 시각이 그 슬롯의 유효 시간대 안에 있을 때만 카운트한다
# (요구사항 문서 4번 "카운트 조건"). 슬롯 시각 정의는 timeline 도메인의 SLOT_TITLES와 같은
# 8개 슬롯을 쓰지만, 유효 "범위"(예: 09:30 슬롯은 11:59까지 유효)는 이 기능 전용이라 별도로 둔다.

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.domain.attendance.models.attendance import AttendanceLog

_KST = ZoneInfo("Asia/Seoul")

# 슬롯키 -> (유효 시작 시각, 유효 종료 시각 - 포함). 문서 4번 "슬롯별 유효 시간대" 표 그대로
SLOT_TIME_RANGES: dict[str, tuple[time, time]] = {
    "0730": (time(7, 30), time(8, 29)),
    "0830": (time(8, 30), time(9, 29)),
    "0930": (time(9, 30), time(11, 59)),
    "1200": (time(12, 0), time(13, 59)),
    "1400": (time(14, 0), time(15, 29)),
    "1530": (time(15, 30), time(17, 29)),
    "1730": (time(17, 30), time(19, 59)),
    "2000": (time(20, 0), time(23, 59)),
}


def _parse_slots(raw: str) -> list[str]:
    return [s for s in raw.split(",") if s]


def _join_slots(slots: list[str]) -> str:
    return ",".join(slots)


def is_slot_key_valid(slot_key: str) -> bool:
    return slot_key in SLOT_TIME_RANGES


# now는 항상 서버 시각(KST) 기준 - 클라이언트가 보낸 시각은 절대 믿지 않는다
def _is_within_valid_window(slot_key: str, now: datetime) -> bool:
    start, end = SLOT_TIME_RANGES[slot_key]
    return start <= now.time() <= end


async def _get_or_create_today_log(session: AsyncSession, user_id: int, today: date) -> AttendanceLog:
    log = await session.scalar(
        select(AttendanceLog).where(AttendanceLog.user_id == user_id, AttendanceLog.log_date == today)
    )
    if log is None:
        log = AttendanceLog(user_id=user_id, log_date=today, visited_slots="")
        session.add(log)
        await session.flush()
    return log


# 슬롯 진입을 기록한다. 카운트 조건(유효 시간대 안 + 하루 한 슬롯당 최대 1회)을 만족 못 하면
# counted=False로 조용히 응답한다(에러가 아니다 - 지난 슬롯을 나중에 열람하는 건 정상적인 경우다)
async def record_visit(session: AsyncSession, user_id: int, slot_key: str) -> tuple[date, list[str], bool]:
    now = datetime.now(_KST).replace(tzinfo=None)
    today = now.date()

    if not is_slot_key_valid(slot_key) or not _is_within_valid_window(slot_key, now):
        log = await session.scalar(
            select(AttendanceLog).where(AttendanceLog.user_id == user_id, AttendanceLog.log_date == today)
        )
        return today, _parse_slots(log.visited_slots) if log else [], False

    log = await _get_or_create_today_log(session, user_id, today)
    slots = _parse_slots(log.visited_slots)
    if slot_key in slots:
        return today, slots, False  # 이미 오늘 카운트됨 - 중복 카운트 없음

    slots.append(slot_key)
    log.visited_slots = _join_slots(slots)
    await session.commit()
    return today, slots, True


async def get_heatmap(session: AsyncSession, user_id: int, year: int) -> list[tuple[date, list[str]]]:
    rows = await session.scalars(
        select(AttendanceLog)
        .where(AttendanceLog.user_id == user_id)
        .where(AttendanceLog.log_date >= date(year, 1, 1))
        .where(AttendanceLog.log_date <= date(year, 12, 31))
        .order_by(AttendanceLog.log_date)
    )
    return [(row.log_date, _parse_slots(row.visited_slots)) for row in rows]
