# calendar.py
# 엔드 포인트 및 URL 주소 매핑

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.domain.calendar.schemas.calendar import CalendarEvent
from backend.domain.calendar.services import calendar as calendar_service

router = APIRouter(prefix="/calendar", tags=["calendar"])


# 해당 연/월에 발표되는 경제지표 이벤트 목록 조회 (publishedAt은 한국시간(KST) 기준)
@router.get("/events", response_model=list[CalendarEvent])
async def get_calendar_events(
    year: int = Query(..., ge=1900, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> list[CalendarEvent]:
    return await calendar_service.get_events_by_month(db, year, month)
