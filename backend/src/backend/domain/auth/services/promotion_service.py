# promotion_service.py
# 활동 데이터(출석·용어 열람)가 기준을 넘으면 승급을 "제안"한다(자동 승급 아님 - 유저가 수락해야
# 등급이 바뀐다). 강등은 없다(문서에 강등 요구가 없어 승급 제안만 다룬다).
#
# 상수로 분리해둬서 나중에 값만 바꿔도 되게 했다. 용어 열람 임계값(4/6)은 지금 glossary_term이
# 24개뿐이라 낮게 잡은 값 - 사전이 더 커지면 team 확인 후 올릴 것.

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.domain.attendance.models.attendance import AttendanceLog
from backend.domain.auth.models.auth import AuthUser, GradePromotionSuggestion
from backend.domain.glossary.models.glossary_view_log import GlossaryViewLog

_KST = ZoneInfo("Asia/Seoul")

ATTENDANCE_WINDOW_DAYS = 30

PROMOTION_RULES: dict[str, dict[str, int | str]] = {
    "애기 개미": {"next_grade": "청년 개미", "min_attendance_days": 15, "min_distinct_terms": 4},
    "청년 개미": {"next_grade": "고참 개미", "min_attendance_days": 22, "min_distinct_terms": 6},
}


async def count_distinct_terms_viewed(session: AsyncSession, user_id: int) -> int:
    result = await session.scalar(
        select(func.count()).select_from(GlossaryViewLog).where(GlossaryViewLog.user_id == user_id)
    )
    return result or 0


async def count_recent_attendance_days(session: AsyncSession, user_id: int, window_days: int = ATTENDANCE_WINDOW_DAYS) -> int:
    since = date.today() - timedelta(days=window_days - 1)
    result = await session.scalar(
        select(func.count())
        .select_from(AttendanceLog)
        .where(AttendanceLog.user_id == user_id)
        .where(AttendanceLog.log_date >= since)
        .where(AttendanceLog.visited_slots != "")
    )
    return result or 0


# 이미 이 유저에게 같은 등급으로 제안한 적이 있는지(대기중이든 이미 응답했든) - 한 번 제안한
# 등급은 다시 권유하지 않는다(수락했든 "나중에"를 눌렀든)
async def _has_existing_suggestion(session: AsyncSession, user_id: int, suggested_grade: str) -> bool:
    existing = await session.scalar(
        select(GradePromotionSuggestion.id)
        .where(GradePromotionSuggestion.user_id == user_id)
        .where(GradePromotionSuggestion.suggested_grade == suggested_grade)
    )
    return existing is not None


# 출석/용어열람 기록이 저장될 때마다 호출한다(POST /attendance/visit, POST /glossary/terms/{id}/view
# 응답 직후). 기준을 넘고 아직 이 등급으로 제안한 적 없으면 새 제안을 만든다. 한 단계씩만 제안한다
# (애기 -> 고참 직행 없음)
async def check_and_create_suggestion(session: AsyncSession, user: AuthUser) -> GradePromotionSuggestion | None:
    rule = PROMOTION_RULES.get(user.grade)
    if rule is None:
        return None  # 이미 최고 등급이거나 규칙에 없는 등급

    attendance_days = await count_recent_attendance_days(session, user.id)
    distinct_terms = await count_distinct_terms_viewed(session, user.id)

    if attendance_days < rule["min_attendance_days"] or distinct_terms < rule["min_distinct_terms"]:
        return None

    suggested_grade = rule["next_grade"]
    if await _has_existing_suggestion(session, user.id, suggested_grade):
        return None

    suggestion = GradePromotionSuggestion(user_id=user.id, suggested_grade=suggested_grade, status="pending")
    session.add(suggestion)
    await session.commit()
    await session.refresh(suggestion)
    return suggestion


async def get_pending_suggestion(session: AsyncSession, user_id: int) -> GradePromotionSuggestion | None:
    return await session.scalar(
        select(GradePromotionSuggestion)
        .where(GradePromotionSuggestion.user_id == user_id)
        .where(GradePromotionSuggestion.status == "pending")
        .order_by(GradePromotionSuggestion.created_at.desc())
    )


class PromotionError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


async def respond_to_suggestion(session: AsyncSession, user: AuthUser, suggestion_id: int, accept: bool) -> GradePromotionSuggestion:
    suggestion = await session.get(GradePromotionSuggestion, suggestion_id)
    if suggestion is None or suggestion.user_id != user.id:
        raise PromotionError("존재하지 않는 제안입니다.")
    if suggestion.status != "pending":
        raise PromotionError("이미 처리된 제안입니다.")

    suggestion.status = "accepted" if accept else "dismissed"
    suggestion.responded_at = _now_kst()
    if accept:
        user.grade = suggestion.suggested_grade

    await session.commit()
    await session.refresh(suggestion)
    return suggestion
