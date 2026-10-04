# timeline_service.py
# 타임라인 슬롯을 수집·저장·조회한다. 슬롯 시간대 정의와 수집 시각도 여기서 정한다.
#   collect_and_save       슬롯을 수집해서 DB에 저장 (스케줄러·POST /timeline/collect)
#   get_day                하루치 슬롯을 DB에서 읽기 (GET /timeline)
#   run_scheduled_collect  슬롯 전용 스케줄러 진입점 (휴장일 확인 + 실패 로깅)

import asyncio
import logging
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from backend.domain.timeline.schemas.timeline import (
    BeginnerGuideItem,
    BriefingPointItem,
    IntradayChangeItem,
    LeadingSectorItem,
    LeadingSectorStockItem,
    NewsItem,
    SlotIndicatorItem,
    TimelineSlotResponse,
    TopGainerItem,
)
from backend.core.database import get_session_factory
from backend.domain.timeline.models.timeline import TimelineSlot
from backend.domain.timeline.services import briefing_service, leading_sector_service, market_hours, market_indicator_service, news_service, prompts, text_review, timeline_repository, top_gainer_service

# 슬롯 정의. slot_key("0730") -> (DB 값 "07:30", 화면 명칭)
# prompts.SLOT_TITLES에서 만든다. 슬롯을 추가·삭제하려면 SLOT_TITLES를 고친다
_SLOT_DEFS = {time_slot.replace(":", ""): (time_slot, title) for time_slot, title in prompts.SLOT_TITLES.items()}

# 주도 섹터를 넣는 슬롯 (정규장 안). 업종 지수가 정규장에만 산출되므로 다른 슬롯에는 넣지 않는다
_SLOTS_WITH_LEADING_SECTOR = {"0930", "1200", "1400", "1530"}

# 지표 6종을 넣는 슬롯 (07:30 글로벌 시황)
_SLOTS_WITH_INDICATORS = {"0730"}

# 장중 변화(07:30 가격 vs 마감 가격)를 넣는 슬롯 (15:30 장 마감). 그날 07:30 슬롯이 DB에 있어야 만들어진다
_SLOTS_WITH_INTRADAY = {"1530"}

# 장중 변화에 쓸 지표. market_indicator_service._INDICATOR_DEFS의 화면 이름과 같아야 한다
_INTRADAY_TARGET_NAMES = ("KOSPI", "KOSDAQ", "USD/KRW")

# 슬롯별 수집 시각 (시, 분). 바꾸면 스케줄러가 그 시각에 수집한다 (서버 재시작 필요)
# 15:30 슬롯만 15:34에 수집한다. 15:20~15:30 종가 동시호가 동안 지수가 멈춰 있고, 결과가 15:30~15:32에 걸쳐 반영된다
# (코스피는 15:30, 코스닥은 15:32 틱에 종가가 들어오고, 일부 업종은 그 뒤에 확정된다). 정각에 수집하면 15:29 값이 저장된다
# 최대한 빨리 보여주되 코스닥 반영(15:32) 뒤 여유를 두려고 15:34로 정했다. 당기려면 15:30~15:37 틱으로 확정 시각을 다시 재볼 것
# 16:00부터 KRX 애프터마켓이 열려 종목 가격이 다시 움직이므로 16:00 전이어야 한다
SLOT_COLLECT_TIMES = {
    "0730": (7, 30),
    "0830": (8, 30),
    "0930": (9, 30),
    "1200": (12, 0),
    "1400": (14, 0),
    "1530": (15, 34),
    "1730": (17, 30),
    "2000": (20, 0),
}

# 슬롯당 뉴스 최대 건수. 값은 news_service._PICK_MAX에서 바꾼다
_NEWS_LIMIT = news_service._PICK_MAX

_KST = ZoneInfo("Asia/Seoul")

logger = logging.getLogger(__name__)


# func를 실행하고 걸린 시간을 로그로 남긴 뒤 결과를 돌려준다 (어느 단계가 느린지 보는 용도)
def _timed(label: str, func, *args, **kwargs):
    started = time.monotonic()
    result = func(*args, **kwargs)
    logger.info("  [%s] %.1f초", label, time.monotonic() - started)
    return result


# 지표 6종 [{code, name, price, change_rate}]를 돌려준다
# force_refresh=True면 캐시를 쓰지 않고 KIS에서 새로 받는다 (07:30·15:30 슬롯이 그 시각 값을 저장할 때)
# 캐시가 비어 있어도 새로 받는다. KIS를 6번 부르므로 async 코드에서는 asyncio.to_thread로 부를 것
def _indicator_rows(*, force_refresh: bool = False) -> list[dict]:
    if force_refresh or not market_indicator_service.get_cache_snapshot():
        market_indicator_service.refresh_all(force=True)

    return [{"code": cached["code"], "name": cached["name"], "price": cached["price"], "change_rate": cached["change_rate"]} for cached in market_indicator_service.get_cache_snapshot().values()]


# 뉴스에서 응답·저장에 쓸 필드만 남긴다 (score 제외)
def _news_fields(rows: list[dict]) -> list[dict]:
    return [{"title": row["title"], "summary": row["summary"], "url": row["url"], "published_at": row["published_at"]} for row in rows]


# 장중 변화 [{name, morning_price, closing_price, change_rate}]를 계산한다
# 기준은 그날 DB의 07:30 슬롯 지표, current는 지금 받은 지표다. 07:30 슬롯이 없으면 빈 목록
async def _intraday_rows(session: AsyncSession, trade_date: date, current: list[dict]) -> list[dict]:
    morning = await timeline_repository.load_slot(session, trade_date, "07:30")
    if morning is None:
        logger.warning("%s 07:30 슬롯이 없어 장중 변화를 만들 수 없습니다.", trade_date)
        return []

    morning_prices = {row.name: row.price for row in morning.indicators}

    rows = []
    for item in current:
        if item["name"] not in _INTRADAY_TARGET_NAMES:
            continue

        morning_price = morning_prices.get(item["name"])
        if not morning_price:  # 값이 없거나 0이면 계산하지 않는다
            continue

        rows.append(
            {
                "name": item["name"],
                "morning_price": morning_price,
                "closing_price": item["price"],
                "change_rate": (item["price"] - morning_price) / morning_price * 100,
            }
        )
    return rows


# 슬롯 하나의 데이터를 모은다 (DB 저장 없음)
#   slot_key          "0730" 형태. _SLOT_DEFS에 없으면 ValueError
#   with_briefing     False면 LLM(뉴스 선별·브리핑·해설)을 건너뛴다
#   intraday_changes  15:30 슬롯의 장중 변화. 브리핑 재료라 호출 전에 만들어서 넘긴다
# 반환: {briefing, beginner_guides, text_holds, news, indicators, leading_sectors, top_gainers, intraday_changes}
#   text_holds 자동 검사에 걸려 화면에서 뺀 문단. 검수 테이블에 저장한다
def collect_slot(slot_key: str, *, with_briefing: bool = True, intraday_changes: list[dict] | None = None) -> dict:
    if slot_key not in _SLOT_DEFS:
        raise ValueError(f"'{slot_key}'는 없는 슬롯입니다. 가능한 값: {', '.join(_SLOT_DEFS)}")

    intraday_changes = intraday_changes or []

    time_slot, _ = _SLOT_DEFS[slot_key]
    logger.info("[수집] %s 시작", time_slot)
    total_started = time.monotonic()

    sectors = _timed("주도 섹터", leading_sector_service.collect) if slot_key in _SLOTS_WITH_LEADING_SECTOR else []
    indicators = _timed("지표 6종", _indicator_rows, force_refresh=True) if slot_key in _SLOTS_WITH_INDICATORS else []
    top_gainers = _timed("급상승 종목", top_gainer_service.collect, slot_key) if slot_key in top_gainer_service.SOURCE_BY_SLOT else []
    news = _timed("뉴스", news_service.collect, time_slot, limit=_NEWS_LIMIT, use_llm=with_briefing)

    # 위에서 모은 값이 전부 브리핑 재료다
    if with_briefing:
        briefing, guides, holds = _timed(
            "LLM 브리핑·해설",
            briefing_service.generate,
            time_slot,
            indicators=indicators,
            sectors=sectors,
            top_gainers=top_gainers,
            intraday_changes=intraday_changes,
            news=news,
        )
    else:
        briefing, guides, holds = None, [], []

    logger.info("[수집] %s 완료 - 총 %.1f초", time_slot, time.monotonic() - total_started)

    return {
        "briefing": briefing,
        "beginner_guides": guides,
        "text_holds": holds,
        "news": _news_fields(news),
        "indicators": indicators,
        "leading_sectors": sectors,
        "top_gainers": top_gainers,
        "intraday_changes": intraday_changes,
    }


# DB의 시각(시간대 없는 한국 시간)에 KST를 붙여 내보낸다. 안 붙이면 프런트가 UTC로 읽을 수 있다
def _with_kst(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=_KST) if value is not None else None


# DB에서 읽은 슬롯을 응답 형태로 바꾼다
def _from_db(slot: TimelineSlot) -> TimelineSlotResponse:
    slot_key = slot.time_slot.replace(":", "")

    return TimelineSlotResponse(
        slot_key=slot_key,
        time_slot=slot.time_slot,
        title=prompts.SLOT_TITLES.get(slot.time_slot, slot.time_slot),
        collected_at=_with_kst(slot.created_at),
        # 확인 중 문단에 띄울 안내 문구. 문단마다 review_status가 "checking"이면 이 문구를 보여준다
        review_message=text_review.REVIEW_MESSAGE,
        briefing_headline=slot.briefing_headline,
        briefing_subtitle=slot.briefing_subtitle,
        briefing_points=[
            BriefingPointItem(seq=row.seq, title=row.title, body=row.body, review_status=text_review.review_status(row.review_note))
            for row in slot.insights
        ],
        beginner_guides=[
            BeginnerGuideItem(
                seq=row.seq,
                title=row.title,
                body=row.body,
                # DB에는 쉼표로 이어 저장돼 있어 목록으로 나눈다
                tags=[tag.strip() for tag in (row.tags or "").split(",") if tag.strip()],
                review_status=text_review.review_status(row.review_note),
            )
            for row in slot.beginner_guides
        ],
        leading_sectors=[
            LeadingSectorItem(
                name=sector.name,
                change_rate=sector.change_rate,
                stocks=[LeadingSectorStockItem(name=stock.name, change_rate=stock.change_rate, label=stock.label) for stock in sector.stocks],
            )
            for sector in slot.leading_sectors
        ],
        top_gainers=[TopGainerItem(seq=row.seq, name=row.name, change_rate=row.change_rate, price=row.price) for row in slot.top_gainers],
        news=[NewsItem(seq=row.seq, title=row.title, summary=row.summary or "", url=row.url, published_at=_with_kst(row.published_at)) for row in slot.news],
        indicators=[SlotIndicatorItem(name=row.name, price=row.price, change_rate=row.change_rate) for row in slot.indicators],
        intraday_changes=[IntradayChangeItem(name=row.name, morning_price=row.morning_price, closing_price=row.closing_price, change_rate=row.change_rate) for row in slot.intraday_changes],
    )


# 슬롯을 수집해서 DB에 저장하고 저장된 값을 돌려준다
#   trade_date     저장할 거래일 (기본 오늘)
#   with_briefing  False면 LLM 단계를 건너뛴다
async def collect_and_save(session: AsyncSession, slot_key: str, *, trade_date: date | None = None, with_briefing: bool = True) -> TimelineSlotResponse:
    if slot_key not in _SLOT_DEFS:
        raise ValueError(f"'{slot_key}'는 없는 슬롯입니다. 가능한 값: {', '.join(_SLOT_DEFS)}")

    time_slot, _ = _SLOT_DEFS[slot_key]
    day = trade_date or datetime.now(_KST).date()

    # 15:30 슬롯은 장중 변화를 브리핑보다 먼저 만든다 (브리핑 재료)
    # 지표는 캐시가 아닌 지금 값으로 받는다
    intraday = []
    if slot_key in _SLOTS_WITH_INTRADAY:
        closing = await asyncio.to_thread(_indicator_rows, force_refresh=True)
        intraday = await _intraday_rows(session, day, closing)

    # 수집은 동기 I/O라 스레드에서 돌린다 (그냥 부르면 1~2분 동안 서버 전체가 멈춘다)
    collected = await asyncio.to_thread(collect_slot, slot_key, with_briefing=with_briefing, intraday_changes=intraday)

    saved = await timeline_repository.save_slot(session, day, time_slot, collected)
    return _from_db(saved)


# 응답에 보여줄 슬롯만 남긴다. 오늘이면 슬롯 시각이 지난 것만, 지난 날짜면 전부
def _visible(slots: list[TimelineSlot], trade_date: date, now: datetime) -> list[TimelineSlot]:
    if trade_date != now.date():
        return slots

    current = f"{now:%H:%M}"
    return [slot for slot in slots if slot.time_slot <= current]


# 하루치 슬롯 조회 (GET /timeline). DB에서 읽기만 한다
async def get_day(session: AsyncSession, trade_date: date, *, now: datetime | None = None) -> list[TimelineSlotResponse]:
    slots = await timeline_repository.load_day(session, trade_date)
    return [_from_db(slot) for slot in _visible(slots, trade_date, now or datetime.now(_KST))]


# 지정한 월(year/month)에 슬롯이 있는 날짜만 "YYYY-MM-DD" 문자열로 반환한다 (GET /timeline/available-dates)
# 프런트 날짜 선택 캘린더가 이 목록에 없는 날짜를 disabled 처리하는 데 쓴다
async def get_available_dates(session: AsyncSession, year: int, month: int) -> list[str]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) - timedelta(days=1) if month == 12 else date(year, month + 1, 1) - timedelta(days=1)
    dates = await timeline_repository.load_dates_with_data(session, start, end)
    return [d.isoformat() for d in dates]


# 스케줄러가 SLOT_COLLECT_TIMES 시각에 부른다
# 휴장일이면 아무것도 하지 않고, 실패해도 예외를 밖으로 내보내지 않는다(다른 슬롯 예약은 유지)
async def run_scheduled_collect(slot_key: str) -> None:
    if not market_hours.is_trading_day():
        logger.info("[스케줄러] %s 건너뜀 - 오늘은 장이 열리지 않습니다.", slot_key)
        return

    started = datetime.now(_KST)
    try:
        async with get_session_factory()() as session:
            saved = await collect_and_save(session, slot_key)
        seconds = (datetime.now(_KST) - started).total_seconds()
        logger.info(
            "[스케줄러] %s %s 저장 완료 (%.0f초) - 뉴스 %d건, 브리핑 %s",
            saved.time_slot, saved.title, seconds, len(saved.news), "있음" if saved.briefing_headline else "없음",
        )
    except Exception as error:
        logger.error("[스케줄러] %s 수집 실패 - %s: %s", slot_key, type(error).__name__, error, exc_info=True)
