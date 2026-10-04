# vix_service.py
# 메인 페이지 VIX(미국 S&P500 옵션으로 계산한 변동성 지수, "공포지수")를 메모리 캐시에 보관한다.
#   refresh   KIS에서 받아 캐시를 바꾼다 (main.py 예약 작업이 30분마다 부른다)
#   get_vix   캐시 읽기 (GET /market/vix). KIS를 호출하지 않는다

import logging
from datetime import UTC, date, datetime, timedelta
from threading import Lock

from backend.core import kis_client
from backend.domain.market.schemas.vix import VixResponse

logger = logging.getLogger(__name__)

# KIS 해외지수 조회값 (구분 "N" = 해외지수, 심볼 "VIX")
_VIX_MARKET_DIV = "N"
_VIX_SYMBOL = "VIX"

# 마지막 정상값 {value, change_value, market_date, updated_at}. 예약 작업(스레드)과 요청이 동시에 읽고 써서 잠금을 둔다
_cache: dict | None = None
_lock = Lock()


# 응답 칸의 숫자 문자열을 float로. 앞에서부터 처음 읽히는 키의 값을 쓰고, 없으면 None
def _number(row: dict, *keys: str) -> float | None:
    for key in keys:
        raw = row.get(key)
        if raw not in (None, ""):
            try:
                return float(str(raw).replace(",", ""))
            except ValueError:
                continue
    return None


# 응답 칸의 "YYYYMMDD"를 date로. 앞에서부터 처음 읽히는 키의 값을 쓰고, 없으면 None
def _date(row: dict, *keys: str) -> date | None:
    for key in keys:
        raw = str(row.get(key) or "")
        if len(raw) == 8 and raw.isdigit():
            return datetime.strptime(raw, "%Y%m%d").date()
    return None


# 현재가 응답에 전일 대비 값이 없을 때 최근 14일 일봉에서 전일 종가를 찾는다. 못 찾으면 ValueError
#   market_date가 있으면 그보다 앞선 가장 최근 종가, 없으면 최신 일봉이 현재가와 같을 때(오늘 행) 그 전 행
def _previous_close(current: float, market_date: date | None) -> float:
    end = market_date or datetime.now(UTC).date()
    start = end - timedelta(days=14)
    rows = kis_client.get_overseas_period_price(
        _VIX_MARKET_DIV,
        _VIX_SYMBOL,
        start.strftime("%Y%m%d"),
        end.strftime("%Y%m%d"),
        "D",
    ).get("output2") or []
    parsed = [
        (_date(row, "stck_bsop_date"), _number(row, "ovrs_nmix_prpr", "stck_clpr"))
        for row in rows
    ]
    parsed = [(day, price) for day, price in parsed if day is not None and price is not None and price > 0]
    parsed.sort(key=lambda item: item[0], reverse=True)
    if market_date is not None:
        previous = next((price for day, price in parsed if day < market_date), None)
    else:
        previous = parsed[1][1] if len(parsed) > 1 and abs(parsed[0][1] - current) < 0.005 else (parsed[0][1] if parsed else None)
    if previous is None:
        raise ValueError("VIX 전일 종가를 찾지 못했습니다.")
    return previous


# 현재가 응답 -> 캐시 dict. 현재값이 없으면 ValueError
# change_value = 전일 종가 대비 포인트 차이 (응답에 없으면 _previous_close로 계산)
def _parse(raw: dict) -> dict:
    output = raw.get("output1") or {}
    value = _number(output, "ovrs_nmix_prpr")
    if value is None or value <= 0:
        raise ValueError("KIS VIX 현재값이 비어 있습니다.")

    market_date = _date(output, "stck_bsop_date", "bass_dt", "xymd")
    change = _number(output, "prdy_vrss", "ovrs_nmix_prdy_vrss")
    change_rate = _number(output, "prdy_ctrt")
    # 전일 대비 값이 부호 없이 오고 부호는 등락률에만 있는 경우가 있어 등락률 방향으로 부호를 맞춘다
    if change is not None and change_rate is not None:
        change = -abs(change) if change_rate < 0 else (abs(change) if change_rate > 0 else 0.0)
    if change is None:
        change = value - _previous_close(value, market_date)

    return {
        "value": round(value, 2),
        "change_value": round(change, 2),
        "market_date": market_date,
        "updated_at": datetime.now(UTC),
    }


# KIS에서 새 값을 받아 캐시를 바꾼다. 실패하면 예외를 올리고 기존 캐시는 그대로 둔다
def refresh() -> None:
    global _cache
    parsed = _parse(kis_client.get_overseas_index_or_fx_price(_VIX_MARKET_DIV, _VIX_SYMBOL))
    with _lock:
        _cache = parsed
    logger.info("VIX 갱신 완료 - %.2f (%+.2f)", parsed["value"], parsed["change_value"])


# 캐시를 응답으로. 아직 한 번도 갱신되지 않았으면 None (라우터가 503)
def get_vix() -> VixResponse | None:
    with _lock:
        cached = dict(_cache) if _cache is not None else None
    return VixResponse(**cached) if cached is not None else None
