# report_repository.py
# 일간·주간 보고서의 DB 저장·조회만 담당한다. 수집·LLM 생성은 보고서 서비스에 있다.
#
# [저장 순서] 보고서 서비스는 세 번에 나눠 저장한다. 앞 단계가 성공하면 뒤 단계가 실패해도 앞 단계 값은 남는다
#   1. save_report_data     수치 (투자자 순매수·VKOSPI·차트 분기·섹터 카드)
#   2. save_report_content  LLM 문구 (제목·요약·섹션·핵심 요약·키워드·용어)
#   3. save_report_images   이미지 URL (메인·섹션1)
#
# [재실행] 같은 종류 + 같은 시작일 보고서가 있으면 그 행을 고쳐 쓴다 (지우고 새로 넣지 않는다)
#   수치를 다시 모으다가 LLM이 실패해도 기존 문구가 사라지지 않게 하기 위해서다

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.domain.timeline.models.report import (
    TimelineReport,
    TimelineReportKeyword,
    TimelineReportPoint,
    TimelineReportQuarter,
    TimelineReportSection,
    TimelineReportSector,
    TimelineReportTerm,
)

_KST = ZoneInfo("Asia/Seoul")

# 보고서 종류 값 (DB report_type 칼럼에 그대로 들어간다)
DAILY = "DAILY"
WEEKLY = "WEEKLY"

# 보고서를 읽을 때 같이 읽어올 자식 테이블
# 비동기 ORM은 나중에 자식을 꺼내면 MissingGreenlet 에러가 나서 미리 읽어야 한다
# 테이블을 추가하면 여기에도 넣을 것 (빠뜨리면 그 값만 빈 채로 응답된다)
_EAGER_LOAD = (
    selectinload(TimelineReport.sections).selectinload(TimelineReportSection.points),
    selectinload(TimelineReport.quarters),
    selectinload(TimelineReport.sectors),
    selectinload(TimelineReport.keywords),
    selectinload(TimelineReport.terms),
)


# 지금 시각을 시간대 없는 한국 시간으로 (DB 저장 형식)
def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


# 종류 + 시작일로 보고서 하나 찾기 (없으면 None)
async def _find(session: AsyncSession, report_type: str, start_date: date) -> TimelineReport | None:
    return await session.scalar(
        select(TimelineReport).where(TimelineReport.report_type == report_type, TimelineReport.start_date == start_date).options(*_EAGER_LOAD)
    )


# 1. 수치 저장. 보고서가 없으면 만들고, 있으면 수치만 고친다 (문구·이미지는 그대로)
#   data 키 (없는 키는 기존 값 유지)
#     "foreign_net_buy" / "institution_net_buy" / "individual_net_buy"  int, 백만원
#     "foreign_badge"                                                  str, 외국인 순매수 흐름 뱃지
#     "vkospi" / "vkospi_change_rate"                                  float
#     "quarters"  [{"label", "usd_krw", "foreign_net_buy", "is_current"}]  오래된 분기부터 (seq는 순서대로 매긴다)
#     "sectors"   [{"sector_name", "change_rate", "rising_count", "total_count", "trade_amount", "prev_trade_amount"}]  주목할 섹터 카드 (한 개)
#   quarters·sectors는 키가 있으면 기존 행을 전부 바꾼다
async def save_report_data(session: AsyncSession, report_type: str, start_date: date, end_date: date, data: dict) -> TimelineReport:
    report = await _find(session, report_type, start_date)
    if report is None:
        report = TimelineReport(report_type=report_type, start_date=start_date, end_date=end_date)
        session.add(report)
    report.end_date = end_date

    for field in ("foreign_net_buy", "institution_net_buy", "individual_net_buy", "foreign_badge", "vkospi", "vkospi_change_rate"):
        if field in data:
            setattr(report, field, data[field])

    if "quarters" in data:
        report.quarters = [
            TimelineReportQuarter(seq=seq, label=item["label"], usd_krw=item.get("usd_krw"), foreign_net_buy=item.get("foreign_net_buy"), is_current=item.get("is_current", False))
            for seq, item in enumerate(data["quarters"], start=1)
        ]

    if "sectors" in data:
        report.sectors = [
            TimelineReportSector(
                sector_name=item["sector_name"],
                change_rate=item.get("change_rate"),
                rising_count=item.get("rising_count"),
                total_count=item.get("total_count"),
                trade_amount=item.get("trade_amount"),
                prev_trade_amount=item.get("prev_trade_amount"),
            )
            for item in data["sectors"]
        ]

    await session.commit()
    return await _find(session, report_type, start_date)


# 2. LLM 문구 저장. LLM이 성공했을 때만 부른다 (실패하면 부르지 않아 기존 문구가 남는다)
#   content 키
#     "title" / "summary" / "conclusion"  str
#     "sections"  [{"title", "description", "points": [str, str, str]}]  섹션 1·2·3 순서
#     "keywords"  [{"title", "description"}]
#     "terms"     [{"term", "description", "source"}]  source "GLOSSARY" / "LLM"
#   문구가 바뀌면 기존 이미지는 내용과 맞지 않으므로 이미지 URL을 비운다 (이어서 save_report_images로 채운다)
#   발행 시각(published_at)을 지금으로 찍는다
#   보고서가 없으면 ValueError (save_report_data를 먼저 불러야 한다)
async def save_report_content(session: AsyncSession, report_type: str, start_date: date, content: dict) -> TimelineReport:
    report = await _find(session, report_type, start_date)
    if report is None:
        raise ValueError(f"{report_type} {start_date} 보고서가 없습니다. save_report_data를 먼저 호출해야 합니다.")

    report.title = content["title"]
    report.summary = content["summary"]
    report.conclusion = content["conclusion"]
    # 자동 검사 사유. NULL이면 정상 문구다 (응답에서 "checking" 표시로 바뀐다)
    report.title_review_note = content.get("title_review_note")
    report.summary_review_note = content.get("summary_review_note")
    report.conclusion_review_note = content.get("conclusion_review_note")
    report.main_image_url = None

    report.sections = [
        TimelineReportSection(
            seq=seq,
            title=section["title"],
            description=section["description"],
            review_note=section.get("review_note"),
            points=[
                TimelineReportPoint(seq=point_seq, body=body, review_note=(section.get("point_notes") or [None] * len(section["points"]))[point_seq - 1])
                for point_seq, body in enumerate(section["points"], start=1)
            ],
        )
        for seq, section in enumerate(content["sections"], start=1)
    ]
    report.keywords = [
        TimelineReportKeyword(seq=seq, title=item["title"], description=item["description"], review_note=item.get("review_note"))
        for seq, item in enumerate(content["keywords"], start=1)
    ]
    report.terms = [TimelineReportTerm(seq=seq, term=item["term"], description=item["description"], source=item["source"]) for seq, item in enumerate(content["terms"], start=1)]

    report.published_at = _now_kst()

    await session.commit()
    return await _find(session, report_type, start_date)


# 3. 이미지 URL 저장. None으로 넘긴 쪽은 건드리지 않는다 (한 장만 실패해도 다른 한 장은 저장된다)
#   section1_image_url은 seq 1 섹션에 들어간다. 섹션이 아직 없으면 무시된다
#   보고서가 없으면 ValueError
async def save_report_images(session: AsyncSession, report_type: str, start_date: date, *, main_image_url: str | None = None, section1_image_url: str | None = None) -> TimelineReport:
    report = await _find(session, report_type, start_date)
    if report is None:
        raise ValueError(f"{report_type} {start_date} 보고서가 없습니다. save_report_data를 먼저 호출해야 합니다.")

    if main_image_url is not None:
        report.main_image_url = main_image_url

    if section1_image_url is not None:
        for section in report.sections:
            if section.seq == 1:
                section.image_url = section1_image_url

    await session.commit()
    return await _find(session, report_type, start_date)


# 프런트 조회용 - 날짜 하나로 보고서를 찾는다 (없으면 None)
#   일간: 그 날짜의 보고서
#   주간: 그 날짜에 만든 보고서 = 종료일(그 주 마지막 거래일)이 그 날짜인 보고서. 주 중간 날짜는 None
async def load_report(session: AsyncSession, report_type: str, target_date: date) -> TimelineReport | None:
    query = select(TimelineReport).where(TimelineReport.report_type == report_type).options(*_EAGER_LOAD)
    if report_type == WEEKLY:
        query = query.where(TimelineReport.end_date == target_date)
    else:
        query = query.where(TimelineReport.start_date == target_date)
    return await session.scalar(query)


# 목록 조회용 - 시작일이 기간 안인 보고서 전체(일간·주간)를 시작일순으로. 목록에는 제목·요약만 쓰므로 자식 테이블은 읽지 않는다
async def load_reports_between(session: AsyncSession, start_date: date, end_date: date) -> list[TimelineReport]:
    result = await session.scalars(
        select(TimelineReport).where(TimelineReport.start_date >= start_date, TimelineReport.start_date <= end_date).order_by(TimelineReport.start_date, TimelineReport.report_type)
    )
    return list(result)


# 주간 보고서 재료 - 기간 안의 일간 보고서를 날짜순으로
async def load_daily_reports(session: AsyncSession, start_date: date, end_date: date) -> list[TimelineReport]:
    result = await session.scalars(
        select(TimelineReport)
        .where(TimelineReport.report_type == DAILY, TimelineReport.start_date >= start_date, TimelineReport.start_date <= end_date)
        .order_by(TimelineReport.start_date)
        .options(*_EAGER_LOAD)
    )
    return list(result)
