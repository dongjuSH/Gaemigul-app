# timeline_repository.py
# 타임라인 슬롯과 문구 검수 대기(timeline_text_hold)의 DB 저장·조회만 담당한다. 수집·가공은 timeline_service에 있다.

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.domain.timeline.models.report import TimelineReport, TimelineReportSection
from backend.domain.timeline.models.timeline import (
    TimelineBeginnerGuide,
    TimelineBriefingInsight,
    TimelineIndicator,
    TimelineIntradayChange,
    TimelineLeadingSector,
    TimelineLeadingSectorStock,
    TimelineNews,
    TimelineSlot,
    TimelineTextHold,
    TimelineTopGainer,
)

_KST = ZoneInfo("Asia/Seoul")

logger = logging.getLogger(__name__)


# 시각을 시간대 없는 한국 시간으로 바꾼다 (DB 저장 형식)
def _to_naive_kst(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(_KST).replace(tzinfo=None)


# 슬롯을 읽을 때 같이 읽어올 자식 테이블
# 비동기 ORM은 나중에 자식을 꺼내면 MissingGreenlet 에러가 나서 미리 읽어야 한다
# 테이블을 추가하면 여기에도 넣을 것 (빠뜨리면 그 값만 빈 채로 응답된다)
_EAGER_LOAD = (
    selectinload(TimelineSlot.insights),
    selectinload(TimelineSlot.beginner_guides),
    selectinload(TimelineSlot.news),
    selectinload(TimelineSlot.indicators),
    selectinload(TimelineSlot.intraday_changes),
    selectinload(TimelineSlot.leading_sectors).selectinload(TimelineLeadingSector.stocks),
    selectinload(TimelineSlot.top_gainers),
)


# 슬롯을 저장하고 저장된 슬롯을 돌려준다
# 같은 날 같은 시간대가 있으면 지우고 새로 넣는다 (자식 행은 cascade로 같이 지워진다)
# 새 브리핑·해설이 비어 있으면 기존 값을 유지한다 (LLM 실패로 재수집할 때 멀쩡한 브리핑을 지우지 않도록)
# collected: timeline_service.collect_slot의 반환값
async def save_slot(session: AsyncSession, trade_date: date, time_slot: str, collected: dict) -> TimelineSlot:
    existing = await session.scalar(
        select(TimelineSlot).where(TimelineSlot.trade_date == trade_date, TimelineSlot.time_slot == time_slot).options(*_EAGER_LOAD)
    )

    briefing = collected.get("briefing")
    guides = collected.get("beginner_guides", [])

    if briefing is None and existing is not None and existing.briefing_headline:
        briefing = {
            "headline": existing.briefing_headline,
            "subtitle": existing.briefing_subtitle,
            "points": [{"seq": row.seq, "title": row.title, "body": row.body, "review_note": row.review_note} for row in existing.insights],
        }
        logger.info("%s %s - 새 브리핑이 없어서 기존 브리핑을 유지합니다.", trade_date, time_slot)

    if not guides and existing is not None and existing.beginner_guides:
        guides = [
            {"seq": row.seq, "title": row.title, "body": row.body, "tags": [tag.strip() for tag in (row.tags or "").split(",") if tag.strip()], "review_note": row.review_note}
            for row in existing.beginner_guides
        ]

    if existing is not None:
        await session.delete(existing)
        await session.flush()  # 삭제를 먼저 반영해야 새 행이 유니크 제약에 걸리지 않는다
    slot = TimelineSlot(
        trade_date=trade_date,
        time_slot=time_slot,
        briefing_headline=briefing["headline"] if briefing else None,
        briefing_subtitle=briefing["subtitle"] if briefing else None,
    )

    if briefing:
        slot.insights = [
            TimelineBriefingInsight(seq=point["seq"], title=point["title"], body=point["body"], review_note=point.get("review_note"))
            for point in briefing["points"]
        ]

    slot.beginner_guides = [
        TimelineBeginnerGuide(
            seq=guide["seq"],
            title=guide["title"],
            body=guide["body"],
            # 태그 목록을 쉼표로 이어 한 칸에 저장한다
            tags=", ".join(guide["tags"]) or None,
            # 자동 검사 사유. 있으면 화면에 "확인 중"으로 표시된다
            review_note=guide.get("review_note"),
        )
        for guide in guides
    ]

    slot.news = [TimelineNews(seq=seq, title=item["title"], summary=item["summary"], url=item["url"], published_at=_to_naive_kst(item.get("published_at"))) for seq, item in enumerate(collected.get("news", []), start=1)]

    slot.indicators = [TimelineIndicator(name=item["name"], price=item["price"], change_rate=item["change_rate"]) for item in collected.get("indicators", [])]

    slot.top_gainers = [
        TimelineTopGainer(seq=item["seq"], name=item["name"], change_rate=item["change_rate"], price=item["price"])
        for item in collected.get("top_gainers", [])
    ]

    slot.intraday_changes = [
        TimelineIntradayChange(name=item["name"], morning_price=item["morning_price"], closing_price=item["closing_price"], change_rate=item["change_rate"])
        for item in collected.get("intraday_changes", [])
    ]

    slot.leading_sectors = [
        TimelineLeadingSector(
            name=sector["name"],
            change_rate=sector["change_rate"],
            stocks=[TimelineLeadingSectorStock(name=stock["name"], change_rate=stock["change_rate"], label=stock["label"]) for stock in sector["stocks"]],
        )
        for sector in collected.get("leading_sectors", [])
    ]

    # 검수 이력은 슬롯 자식이 아니라 따로 쌓는다 (슬롯을 다시 저장해도 기록이 지워지지 않게)
    for hold in collected.get("text_holds", []):
        session.add(
            TimelineTextHold(
                target_date=trade_date,
                source=time_slot,
                part=hold["part"],
                seq=hold["seq"],
                kind=hold["kind"],
                title=hold["title"],
                body=hold["body"],
                tags=hold["tags"],
                issues=hold["issues"],
            )
        )

    session.add(slot)
    await session.commit()

    # 자식 테이블까지 붙여 다시 읽어 돌려준다
    return await load_slot(session, trade_date, time_slot)


# 슬롯 하나 조회 (없으면 None)
async def load_slot(session: AsyncSession, trade_date: date, time_slot: str) -> TimelineSlot | None:
    return await session.scalar(select(TimelineSlot).where(TimelineSlot.trade_date == trade_date, TimelineSlot.time_slot == time_slot).options(*_EAGER_LOAD))


# 하루치 슬롯을 시간순으로 조회 ("07:30" 문자열 정렬이 곧 시간순이다)
async def load_day(session: AsyncSession, trade_date: date) -> list[TimelineSlot]:
    result = await session.scalars(select(TimelineSlot).where(TimelineSlot.trade_date == trade_date).order_by(TimelineSlot.time_slot).options(*_EAGER_LOAD))
    return list(result)


# start~end(포함) 구간에서 슬롯이 하나라도 있는 날짜만 조회한다. 프런트 날짜 선택 캘린더가
# "데이터 없는 날짜는 선택 못 하게" 비활성 처리하는 데 쓴다 - 자식 테이블은 필요 없어 얕게 조회한다
async def load_dates_with_data(session: AsyncSession, start: date, end: date) -> list[date]:
    result = await session.scalars(
        select(TimelineSlot.trade_date)
        .where(TimelineSlot.trade_date >= start, TimelineSlot.trade_date <= end)
        .distinct()
        .order_by(TimelineSlot.trade_date)
    )
    return list(result)
# 확인이 필요한 문단 조회 (최신순). 하루 한 번 보는 목록이다
#   target_date  그날 것만 볼 때. None이면 전체
#   pending_only True면 아직 확인하지 않은 것만 (resolved=False)
async def load_text_holds(session: AsyncSession, target_date: date | None = None, *, pending_only: bool = True) -> list[TimelineTextHold]:
    query = select(TimelineTextHold).order_by(TimelineTextHold.id.desc())
    if target_date is not None:
        query = query.where(TimelineTextHold.target_date == target_date)
    if pending_only:
        query = query.where(TimelineTextHold.resolved.is_(False))
    return list(await session.scalars(query))

# 검수 기록이 가리키는 문구 행을 찾아 표시를 내린다 (review_note를 비운다)
# 문구를 다시 만들어 순서가 바뀌었으면 못 찾을 수 있다 -> 그때는 False를 돌려주고 기록만 확인 완료로 둔다
async def _clear_review_note(session: AsyncSession, hold: TimelineTextHold) -> bool:
    # 슬롯 문구 - source가 "07:30" 같은 슬롯 시각이다
    if ":" in hold.source:
        slot = await load_slot(session, hold.target_date, hold.source)
        if slot is None:
            return False
        rows = slot.insights if hold.part == "briefing_point" else slot.beginner_guides
        target = next((row for row in rows if row.seq == hold.seq), None)
        if target is None:
            return False
        target.review_note = None
        return True

    # 보고서 문구 - source가 "DAILY" / "WEEKLY"다. start_date가 검수 기록의 날짜다
    report = await session.scalar(
        select(TimelineReport)
        .where(TimelineReport.report_type == hold.source, TimelineReport.start_date == hold.target_date)
        .options(selectinload(TimelineReport.sections).selectinload(TimelineReportSection.points), selectinload(TimelineReport.keywords))
    )
    if report is None:
        return False
    if hold.part == "report_title":
        report.title_review_note = None
        return True
    if hold.part == "report_summary":
        report.summary_review_note = None
        return True
    if hold.part == "report_conclusion":
        report.conclusion_review_note = None
        return True
    if hold.part == "report_keyword":
        target = next((row for row in report.keywords if row.seq == hold.seq), None)
    elif hold.part == "report_section":
        target = next((row for row in report.sections if row.seq == hold.seq), None)
    elif hold.part == "report_point":
        # seq는 "섹션 번호 * 10 + 문단 번호"다 (report_service._review_items)
        section = next((row for row in report.sections if row.seq == hold.seq // 10), None)
        target = next((row for row in section.points if row.seq == hold.seq % 10), None) if section else None
    else:
        target = None
    if target is None:
        return False
    target.review_note = None
    return True


# 확인이 필요한 문단 하나를 확인 완료로 바꾸고, 그 문구의 "확인 중" 표시도 같이 내린다 (없으면 None)
# 사람이 문장을 고친 뒤 부른다. 표시만 내리므로 문장 수정은 따로 해야 한다
async def resolve_text_hold(session: AsyncSession, hold_id: int) -> TimelineTextHold | None:
    row = await session.get(TimelineTextHold, hold_id)
    if row is None:
        return None
    if not await _clear_review_note(session, row):
        logger.warning("검수 %d번 - 표시를 내릴 문구를 찾지 못했습니다 (%s %s %s seq=%d). 기록만 확인 완료로 둡니다.", hold_id, row.target_date, row.source, row.part, row.seq)
    row.resolved = True
    await session.commit()
    return row


# 보고서 문구 중 확인이 필요한 것을 검수 테이블에 남긴다 (보고서 문단은 화면에 그대로 나간다)
#   source  "DAILY" / "WEEKLY",  start_date  보고서 시작일
#   holds   [{"part", "seq", "title", "body", "issues"}]
async def save_report_holds(session: AsyncSession, source: str, start_date: date, holds: list[dict]) -> None:
    for hold in holds:
        session.add(
            TimelineTextHold(
                target_date=start_date,
                source=source,
                part=hold["part"],
                seq=hold["seq"],
                title=hold.get("title"),
                body=hold["body"],
                issues=hold["issues"],
            )
        )
    if holds:
        await session.commit()
