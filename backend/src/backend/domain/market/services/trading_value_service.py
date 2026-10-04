# trading_value_service.py
# 메인 페이지 시간대별 거래대금 분포(정규장 30분 구간 14개, 코스피+코스닥 합산)를 메모리 캐시에 보관한다.
#   refresh                          KIS 업종 30분봉으로 캐시를 바꾼다 (서버 시작 시, 평일 15:34:30)
#   get_trading_value_distribution   캐시 읽기 (GET /market/trading-value-distribution). KIS를 호출하지 않는다
#
# KIS 분봉의 거래대금(acml_tr_pbmn)은 그날 누적값이라, 각 시각 누적값에서 직전 시각 누적값을 빼 구간 금액을 만든다
# 14개 시각이 모두 있는 가장 최근 거래일만 쓴다. 그래서 오늘 15:30 봉이 생기기 전(장중·휴장일)에는 전 거래일 분포가 나간다

import logging
from datetime import UTC, date, datetime
from threading import Lock

from backend.core import kis_client
from backend.domain.market.schemas.trading_value import TradingValueDistributionResponse

logger = logging.getLogger(__name__)

# 분포에 쓰는 분봉 시각 ("090000" ~ "153000", 30분 간격 14개). 바꾸면 응답 막대 수와 "완성된 거래일" 기준이 같이 바뀐다
_EXPECTED_TIMES = tuple(f"{hour:02d}{minute:02d}00" for hour in range(9, 16) for minute in (0, 30) if not (hour == 15 and minute > 30))

# 마지막 정상값 {market_date, points, unit, updated_at}. 예약 작업(스레드)과 요청이 동시에 읽고 써서 잠금을 둔다
_cache: dict | None = None
_lock = Lock()


# 응답 칸의 숫자 문자열을 int로. 비었거나 숫자가 아니면 None
def _number(row: dict, key: str) -> int | None:
    raw = row.get(key)
    if raw in (None, ""):
        return None
    try:
        return int(float(str(raw).replace(",", "")))
    except ValueError:
        return None


# 분봉 응답 -> {날짜: {"HHMMSS": 누적 거래대금}}. _EXPECTED_TIMES에 없는 시각과 잘못된 행은 버린다
def _rows_by_day(raw: dict) -> dict[date, dict[str, int]]:
    result: dict[date, dict[str, int]] = {}
    for row in raw.get("output2") or []:
        raw_day = str(row.get("stck_bsop_date") or "")
        raw_time = str(row.get("stck_cntg_hour") or "").zfill(6)
        amount = _number(row, "acml_tr_pbmn")
        if len(raw_day) != 8 or not raw_day.isdigit() or raw_time not in _EXPECTED_TIMES or amount is None or amount < 0:
            continue
        day = datetime.strptime(raw_day, "%Y%m%d").date()
        result.setdefault(day, {})[raw_time] = amount
    return result


# 두 시장 분봉 -> 캐시 dict. 완성된 거래일이 없거나 누적값이 줄어드는 시각이 있으면 ValueError
# 09:00 막대는 그날 첫 누적값 그대로다
def _parse(kospi_raw: dict, kosdaq_raw: dict) -> dict:
    kospi, kosdaq = _rows_by_day(kospi_raw), _rows_by_day(kosdaq_raw)
    complete_days = [
        day
        for day in set(kospi) & set(kosdaq)
        if all(slot in kospi[day] and slot in kosdaq[day] for slot in _EXPECTED_TIMES)
    ]
    if not complete_days:
        raise ValueError("KIS에서 완성된 시간대별 거래대금 거래일을 찾지 못했습니다.")
    market_date = max(complete_days)

    previous = 0
    points = []
    for slot in _EXPECTED_TIMES:
        cumulative = kospi[market_date][slot] + kosdaq[market_date][slot]
        amount = cumulative - previous
        if amount < 0:
            raise ValueError(f"{market_date} {slot} 누적 거래대금이 직전 값보다 작습니다.")
        points.append({"time_slot": f"{slot[:2]}:{slot[2:4]}", "amount": amount})
        previous = cumulative

    return {
        "market_date": market_date,
        "points": points,
        "unit": "million_krw",
        "updated_at": datetime.now(UTC),
    }


# KIS 30분봉(과거 포함)으로 캐시를 바꾼다 (KIS 2회). 실패하면 예외를 올리고 기존 캐시는 그대로 둔다
def refresh() -> None:
    global _cache
    parsed = _parse(
        kis_client.get_index_minute_price("0001", "1800", True),
        kis_client.get_index_minute_price("1001", "1800", True),
    )
    with _lock:
        _cache = parsed
    logger.info("시간대별 거래대금 갱신 완료 - %s (%d개)", parsed["market_date"], len(parsed["points"]))


# 캐시를 응답으로. 아직 한 번도 갱신되지 않았으면 None (라우터가 503)
def get_trading_value_distribution() -> TradingValueDistributionResponse | None:
    with _lock:
        cached = dict(_cache) if _cache is not None else None
    return TradingValueDistributionResponse(**cached) if cached is not None else None
