# timeline.py
# timeline 도메인의 API 엔드포인트. 실제 처리는 services에 있고 여기서는 연결만 한다.
# GET은 누구나 부를 수 있고, 수집·보고서 생성 POST는 관리용 키가 있어야 한다 (require_admin_key)

import secrets
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.core.database import get_db

from backend.domain.timeline.schemas.market_indicator import IndicatorBarResponse
from backend.domain.timeline.schemas.report import ReportListResponse, ReportResponse
from backend.domain.timeline.schemas.timeline import TextHoldItem, TimelineSlotResponse
from backend.domain.timeline.services import glossary, market_indicator_service, report_repository, report_service, timeline_repository, timeline_service

_KST = ZoneInfo("Asia/Seoul")

router = APIRouter(prefix="/timeline", tags=["timeline"])


# 관리용 POST 앞에서 호출 권한을 확인한다 (한 번 부를 때마다 KIS·제미나이·이미지 생성 비용이 든다)
#   요청 헤더 X-Admin-Key == .env의 ADMIN_API_KEY 여야 한다. 다르면 401
#   서버에 키가 없으면 503으로 막는다 (배포 주소가 공개된 상태에서 열려 있는 것을 막기 위해)
# 키를 바꾸려면 .env를 고치고 서버를 재시작한다
def require_admin_key(x_admin_key: str = Header(default="", alias="X-Admin-Key")) -> None:
    expected = get_settings().admin_api_key
    if not expected:
        raise HTTPException(status_code=503, detail="ADMIN_API_KEY가 서버에 없어 이 작업을 쓸 수 없습니다.")
    if not secrets.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="X-Admin-Key 헤더가 올바르지 않습니다.")


# GET /timeline/indicators - 최상단 지표 바. 캐시만 읽는다
@router.get("/indicators", response_model=IndicatorBarResponse)
def get_indicators() -> IndicatorBarResponse:
    return market_indicator_service.get_indicators()


# GET /timeline/glossary - 용어 사전 {용어: 설명}. 프런트 호버 설명용
@router.get("/glossary")
def get_glossary() -> dict[str, str]:
    return glossary.GLOSSARY


# GET /timeline?date=2026-09-14 - 하루치 슬롯 (프런트용). date를 빼면 오늘
# DB에서 읽기만 한다. 오늘이면 슬롯 시각이 지난 슬롯만 나온다
@router.get("", response_model=list[TimelineSlotResponse])
async def get_day(date_: date | None = Query(default=None, alias="date"), session: AsyncSession = Depends(get_db)) -> list[TimelineSlotResponse]:
    return await timeline_service.get_day(session, date_ or datetime.now(_KST).date())


# GET /timeline/available-dates?year=2026&month=9 - 그 달에 슬롯이 있는 날짜 목록("YYYY-MM-DD").
# 프런트 날짜 선택 캘린더가 데이터 없는 날짜를 선택 못 하게(disabled) 처리하는 데 쓴다
@router.get("/available-dates", response_model=list[str])
async def get_available_dates(year: int = Query(ge=2000, le=2100), month: int = Query(ge=1, le=12), session: AsyncSession = Depends(get_db)) -> list[str]:
    return await timeline_service.get_available_dates(session, year, month)


# POST /timeline/collect/{slot_key} - 슬롯을 수집해서 DB에 저장 (스케줄러 동작을 수동 실행)
# 같은 날 같은 슬롯이 있으면 덮어쓴다. ?with_briefing=false면 LLM 생략, ?trade_date=로 날짜 지정
@router.post("/collect/{slot_key}", response_model=TimelineSlotResponse, dependencies=[Depends(require_admin_key)])
async def collect_slot(slot_key: str, with_briefing: bool = True, trade_date: date | None = None, session: AsyncSession = Depends(get_db)) -> TimelineSlotResponse:
    try:
        return await timeline_service.collect_and_save(session, slot_key, trade_date=trade_date, with_briefing=with_briefing)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


# 보고서 종류 쿼리 값 -> DB 값. 키를 바꾸면 프런트가 보내는 type 값이 바뀐다
_REPORT_TYPES = {"daily": report_repository.DAILY, "weekly": report_repository.WEEKLY}


# GET /timeline/report?type=daily&date=2026-09-14 - 보고서 (프런트용). date를 빼면 오늘
# 일간은 그날 보고서, 주간은 그날 만든 보고서(그 주 마지막 거래일에만 있다). 없으면 null
# DB에서 읽기만 한다
@router.get("/report", response_model=ReportResponse | None)
async def get_report(type_: str = Query(alias="type"), date_: date | None = Query(default=None, alias="date"), session: AsyncSession = Depends(get_db)) -> ReportResponse | None:
    if type_ not in _REPORT_TYPES:
        raise HTTPException(status_code=404, detail=f"'{type_}'는 없는 보고서 종류입니다. 가능한 값: {', '.join(_REPORT_TYPES)}")
    return await report_service.get_report(session, _REPORT_TYPES[type_], date_ or datetime.now(_KST).date())


# GET /timeline/reports?year=2026&month=9 - 월별 보고서 목록 (프런트 브리핑 탭 우측 목록). 주 묶음·주차는 report_service.get_report_list
# 카드를 누르면 GET /timeline/report?type=(daily|weekly)&date=(end_date)로 상세를 부른다. DB에서 읽기만 한다(주 거래일 판단에 휴장일 조회 캐시 사용)
@router.get("/reports", response_model=ReportListResponse)
async def get_report_list(year: int = Query(ge=2000, le=2100), month: int = Query(ge=1, le=12), session: AsyncSession = Depends(get_db)) -> ReportListResponse:
    return await report_service.get_report_list(session, year, month)


# POST /timeline/report/daily?date=2026-09-14 - 일간 보고서 생성·저장 (스케줄러 동작을 수동 실행). date를 빼면 오늘
# 같은 날 보고서가 있으면 고쳐 쓴다. LLM·이미지 포함 10~20초 걸린다
# 주의: 섹터 카드의 상승 종목 수는 그날 다음 개장 전까지만 채워진다
@router.post("/report/daily", response_model=ReportResponse, dependencies=[Depends(require_admin_key)])
async def create_daily_report(date_: date | None = Query(default=None, alias="date"), session: AsyncSession = Depends(get_db)) -> ReportResponse:
    return report_service.to_response(await report_service.generate_daily(session, date_))


# POST /timeline/report/weekly?date=2026-09-14 - date가 속한 주의 주간 보고서 생성·저장. date를 빼면 이번 주
# 그 주 일간 보고서가 없으면 404
@router.post("/report/weekly", response_model=ReportResponse, dependencies=[Depends(require_admin_key)])
async def create_weekly_report(date_: date | None = Query(default=None, alias="date"), session: AsyncSession = Depends(get_db)) -> ReportResponse:
    report = await report_service.generate_weekly(session, date_)
    if report is None:
        raise HTTPException(status_code=404, detail="그 주의 일간 보고서가 없어 주간 보고서를 만들 수 없습니다.")
    return report_service.to_response(report)


# GET /timeline/holds?date=2026-09-21 - 자동 검사에 걸려 보류된 문구 목록 (관리용, 하루 한 번 확인한다)
# date를 빼면 전체, ?pending_only=false면 확인을 끝낸 것까지 본다
# 화면에 내보내지 않은 문구라 관리용 키가 있어야 한다
@router.get("/holds", response_model=list[TextHoldItem], dependencies=[Depends(require_admin_key)])
async def get_text_holds(
    date_: date | None = Query(default=None, alias="date"),
    pending_only: bool = True,
    session: AsyncSession = Depends(get_db),
) -> list[TextHoldItem]:
    rows = await timeline_repository.load_text_holds(session, date_, pending_only=pending_only)
    return [TextHoldItem.model_validate(row, from_attributes=True) for row in rows]


# POST /timeline/holds/{hold_id}/resolve - 그 문구 확인을 끝냈다고 표시한다
# 목록에서 빠지고, 그 문구의 화면 "확인 중" 표시(review_note)도 같이 내려간다
# 문장 수정은 따로 해야 한다 - 고친 뒤에 이것을 부른다. 문구를 다시 만들어 순서가 바뀌었으면 표시를 못 찾고 기록만 확인 완료가 된다(WARNING 로그)
@router.post("/holds/{hold_id}/resolve", response_model=TextHoldItem, dependencies=[Depends(require_admin_key)])
async def resolve_text_hold(hold_id: int, session: AsyncSession = Depends(get_db)) -> TextHoldItem:
    row = await timeline_repository.resolve_text_hold(session, hold_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"{hold_id}번 검수 문구가 없습니다.")
    return TextHoldItem.model_validate(row, from_attributes=True)
