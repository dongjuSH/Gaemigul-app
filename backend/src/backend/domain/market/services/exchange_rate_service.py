# exchange_rate_service.py
# 메인 페이지 원/달러 환율 차트 (오늘·5일·1개월)를 만들어 메모리 캐시에 보관한다.
#   refresh             KIS 현재가를 30분 칸에 저장하고 세 기간 캐시를 다시 만든다 (main.py 예약 작업이 부른다)
#   get_exchange_rate   캐시 읽기 (GET /market/exchange-rate). KIS·DB를 호출하지 않는다
#
# 오늘·5일은 KIS가 환율 분봉을 주지 않아(현재가 API의 output2가 빈 배열) 30분마다 받은 현재가를
# market_exchange_rate_snapshot 테이블에 쌓아 쓴다. 1개월은 KIS 일봉을 쓴다. 값을 보간하거나 지어내지 않는다

import asyncio
import logging
from datetime import UTC, date, datetime, time, timedelta
from threading import Lock
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.core import kis_client
from backend.core.database import get_session_factory
from backend.domain.market.models.exchange_rate import ExchangeRateSnapshot
from backend.domain.market.schemas.exchange_rate import ExchangeRateResponse

logger = logging.getLogger(__name__)

_KST = ZoneInfo("Asia/Seoul")

# KIS 원/달러 조회값 (kis_client.get_overseas_index_or_fx_price와 같은 구분·심볼)
_MARKET_DIV = "X"
_SYMBOL = "FX@KRW"

# 5일·1개월 차트 한 장의 점 개수. 바꾸면 두 기간의 점 수와 is_complete 기준이 바뀐다
# ("오늘"은 개수 제한 없이 오늘 쌓인 30분 칸을 전부 보낸다 - refresh 참고)
_POINT_COUNT = 8

# 스냅샷 보관 일수. 5일 차트에 필요한 범위보다 여유를 둔다 (장애·휴일 대비). 줄이면 5일 차트가 비어 보일 수 있다
_RETENTION_DAYS = 10

# 30분 칸 시각에서 이만큼 안에 실행됐을 때만 스냅샷을 저장한다
# 서버 시작 직후 실행이나 밀린 실행이 그 칸을 다른 시각 값으로 덮어쓰지 않게 한다 (그때는 캐시만 다시 만든다)
_SNAPSHOT_TOLERANCE = timedelta(minutes=2)

# 기간별 응답 캐시 {"today"|"5d"|"1m": 응답 dict}. 예약 작업(스레드)과 요청이 동시에 읽고 써서 잠금을 둔다
_cache: dict[str, dict] = {}
_lock = Lock()


# 응답 칸의 숫자 문자열("1,379.10")을 float로. 앞에서부터 처음 읽히는 키의 값을 쓰고, 없으면 None
def _number(row: dict, *keys: str) -> float | None:
    for key in keys:
        raw = row.get(key)
        if raw not in (None, ""):
            try:
                return float(str(raw).replace(",", ""))
            except ValueError:
                continue
    return None


# 시각을 속한 30분 칸의 시작으로 내린다 (10:17 -> 10:00, 10:45 -> 10:30)
def _floor_half_hour(now: datetime) -> datetime:
    return now.replace(minute=0 if now.minute < 30 else 30, second=0, microsecond=0)


# 시간순 관측값에서 처음·마지막을 포함해 최대 count개를 고르게 뽑는다 (값은 원본 그대로)
def _evenly_spaced(points: list[tuple[datetime, float]], count: int = _POINT_COUNT) -> list[tuple[datetime, float]]:
    if len(points) <= count:
        return points
    indices = [round(index * (len(points) - 1) / (count - 1)) for index in range(count)]
    return [points[index] for index in indices]


# 기간 하나의 응답 dict. is_complete를 넘기지 않으면 "점이 _POINT_COUNT개 모였는지"로 정한다
def _payload(
    period: str,
    points: list[tuple[datetime, float]],
    updated_at: datetime,
    *,
    is_complete: bool | None = None,
    requested_point_count: int = _POINT_COUNT,
) -> dict:
    return {
        "period": period,
        # DB에는 시간대 없는 한국 시간으로 두지만 응답에는 +09:00을 붙인다 (브라우저가 UTC로 읽지 않도록)
        "points": [
            {
                "timestamp": timestamp.replace(tzinfo=_KST) if timestamp.tzinfo is None else timestamp,
                "value": round(value, 2),
            }
            for timestamp, value in points
        ],
        "requested_point_count": requested_point_count,
        "is_complete": len(points) == _POINT_COUNT if is_complete is None else is_complete,
        "updated_at": updated_at,
    }


# 30분 칸 값을 저장한다 (같은 칸이 있으면 값만 바꾼다). 같은 트랜잭션에서 _RETENTION_DAYS보다 오래된 행을 지운다
#   sampled_at  30분 칸 시각 (시간대 없는 한국 시간)
# INSERT ... ON CONFLICT로 한 번에 넣는다. 조회 후 넣는 방식은 서버가 두 대 이상일 때
# 같은 칸을 동시에 넣다가 UNIQUE 제약 위반으로 그 회차 갱신이 통째로 실패한다 (9/18 07:00 실제 발생)
async def _save_snapshot(sampled_at: datetime, value: float) -> None:
    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(
            pg_insert(ExchangeRateSnapshot)
            .values(sampled_at=sampled_at, value=value, created_at=datetime.now(_KST).replace(tzinfo=None))
            .on_conflict_do_update(index_elements=[ExchangeRateSnapshot.sampled_at], set_={"value": value})
        )
        # 정확히 경계 시각인 행은 남긴다
        await session.execute(
            delete(ExchangeRateSnapshot).where(
                ExchangeRateSnapshot.sampled_at < sampled_at - timedelta(days=_RETENTION_DAYS)
            )
        )
        await session.commit()


# start 이후 스냅샷을 시간순으로 [(시각, 값)]
async def _snapshot_points(start: datetime) -> list[tuple[datetime, float]]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        rows = (
            await session.scalars(
                select(ExchangeRateSnapshot)
                .where(ExchangeRateSnapshot.sampled_at >= start)
                .order_by(ExchangeRateSnapshot.sampled_at)
            )
        ).all()
    return [(row.sampled_at, row.value) for row in rows]


# 1개월 차트 점 (동기 - KIS 호출). 최근 31일 일봉에서 최대 _POINT_COUNT개, 오늘 값은 current(방금 받은 현재가)로 바꾼다
def _monthly_points(now_kst: datetime, current: float) -> list[tuple[datetime, float]]:
    start = now_kst.date() - timedelta(days=31)
    raw = kis_client.get_overseas_period_price(
        _MARKET_DIV,
        _SYMBOL,
        start.strftime("%Y%m%d"),
        now_kst.strftime("%Y%m%d"),
        "D",
    )
    by_day: dict[date, float] = {}
    for row in raw.get("output2") or []:
        raw_day = str(row.get("stck_bsop_date") or "")
        value = _number(row, "ovrs_nmix_prpr", "stck_clpr")
        if len(raw_day) == 8 and raw_day.isdigit() and value is not None and value > 0:
            day = datetime.strptime(raw_day, "%Y%m%d").date()
            if day >= start:
                by_day[day] = value

    # 오늘 일봉이 아직 없거나 이전 값이어도 방금 받은 현재가로 맞춘다
    by_day[now_kst.date()] = current
    points = [(datetime.combine(day, time.min), value) for day, value in sorted(by_day.items())]
    return _evenly_spaced(points)


# 현재가를 받아 30분 칸에 저장하고(칸 시각 근처에서 실행됐을 때만) 세 기간 캐시를 새로 만든다
# 실패하면 예외를 올리고 기존 캐시는 그대로 둔다 (스케줄러가 로그를 남긴다)
async def refresh() -> None:
    now_kst = datetime.now(_KST)
    sampled_at = _floor_half_hour(now_kst).replace(tzinfo=None)
    raw_current = await asyncio.to_thread(kis_client.get_overseas_index_or_fx_price, _MARKET_DIV, _SYMBOL)
    output = raw_current.get("output1") or {}
    current = _number(output, "ovrs_nmix_prpr")
    if current is None or current <= 0:
        raise ValueError("KIS 원/달러 현재값이 비어 있습니다.")

    if now_kst.replace(tzinfo=None) - sampled_at <= _SNAPSHOT_TOLERANCE:
        await _save_snapshot(sampled_at, current)
    else:
        logger.info("원/달러 환율 %s 칸 저장 건너뜀 - 칸 시각에서 %d분 지난 실행이라 캐시만 갱신합니다.", sampled_at.strftime("%H:%M"), (now_kst.replace(tzinfo=None) - sampled_at).seconds // 60)

    today_start = datetime.combine(now_kst.date(), time.min)
    today_all = await _snapshot_points(today_start)
    five_day_start = sampled_at - timedelta(days=5)
    five_day_all = await _snapshot_points(five_day_start)
    # 오늘 = 오늘(자정부터) 쌓인 30분 칸 전부. 개수를 자르지 않아 하루 흐름이 30분 간격으로 다 보인다
    today = today_all
    five_day = _evenly_spaced(five_day_all)
    month = await asyncio.to_thread(_monthly_points, now_kst, current)
    updated_at = datetime.now(UTC)

    new_cache = {
        # 오늘 = 오늘 스냅샷 전부. 정해진 개수가 없으므로 받은 만큼이 곧 전부(점이 하나라도 있으면 완성)
        "today": _payload(
            "today",
            today,
            updated_at,
            is_complete=bool(today),
            requested_point_count=len(today),
        ),
        # 5일은 점이 _POINT_COUNT개 모여도, 첫 관측값이 범위 시작 30분 안에 있어야(실제로 5일치가 쌓여야) 완성으로 본다
        "5d": _payload(
            "5d",
            five_day,
            updated_at,
            is_complete=(
                len(five_day) == _POINT_COUNT
                and bool(five_day_all)
                and five_day_all[0][0] <= five_day_start + timedelta(minutes=30)
            ),
        ),
        "1m": _payload("1m", month, updated_at),
    }
    with _lock:
        _cache.clear()
        _cache.update(new_cache)
    logger.info("원/달러 환율 갱신 완료 - %.2f (오늘 %d, 5일 %d, 월간 %d개)", current, len(today), len(five_day), len(month))


# 기간 하나의 캐시를 응답으로. 아직 한 번도 갱신되지 않았으면 None (라우터가 503)
#   period  "today" / "5d" / "1m"
def get_exchange_rate(period: str) -> ExchangeRateResponse | None:
    with _lock:
        cached = _cache.get(period)
        copied = dict(cached) if cached is not None else None
    return ExchangeRateResponse(**copied) if copied is not None else None
