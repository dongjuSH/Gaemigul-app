# attendance.py
# "굴 파기 기록" API. 로그인한 사용자만 쓴다(문서 4번 "대상: 로그인한 사용자만")

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.domain.auth.dependencies import get_current_user
from backend.domain.auth.models.auth import AuthUser
from backend.domain.attendance.schemas.attendance import (
    AttendanceDayResponse,
    AttendanceVisitResponse,
    RecordVisitRequest,
)
from backend.domain.attendance.services import attendance_service
from backend.domain.auth.services import promotion_service

router = APIRouter(prefix="/attendance", tags=["attendance"])


# POST /attendance/visit - 실시간 페로몬 슬롯 콘텐츠 진입 시 프런트가 호출.
# 유효 시간대 밖이거나 이미 카운트된 슬롯이면 counted=false로 응답(에러 아님)
@router.post("/visit", response_model=AttendanceVisitResponse)
async def record_visit(
    data: RecordVisitRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttendanceVisitResponse:
    log_date, visited_slots, counted = await attendance_service.record_visit(db, current_user.id, data.slot_key)
    if counted:
        # 활동 데이터가 방금 늘었으니 승급 기준을 넘었는지 그 자리에서 확인한다(등급 시스템 확장)
        await promotion_service.check_and_create_suggestion(db, current_user)
    return AttendanceVisitResponse(date=log_date.isoformat(), visited_slots=visited_slots, counted=counted)


# GET /attendance/heatmap?year=2026 - 마이페이지 굴 파기 기록 그리드용. 그해에 방문 기록이 있는 날짜만 내려준다
@router.get("/heatmap", response_model=list[AttendanceDayResponse])
async def get_heatmap(
    year: int = Query(ge=2000, le=2100),
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AttendanceDayResponse]:
    rows = await attendance_service.get_heatmap(db, current_user.id, year)
    return [AttendanceDayResponse(date=log_date.isoformat(), visited_slots=slots) for log_date, slots in rows]
