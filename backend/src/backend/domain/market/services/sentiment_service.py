# sentiment_service.py
# 메인 페이지 개미굴 시장심리지수(0~100점)를 계산해 메모리 캐시에 보관한다.
#   refresh         KIS 값으로 점수를 다시 계산한다 (main.py의 market_session 작업이 장중 30분마다 부른다)
#   get_sentiment   캐시 읽기 (GET /market/sentiment). KIS를 호출하지 않는다
#
# 점수 = 항목별 0~100점 x _WEIGHTS 가중치의 합
#   momentum      지수 모멘텀     코스피 등락률 x 0.7 + 코스닥 등락률 x 0.3 을 최근 _REFERENCE_DAYS거래일 분포의 백분위로
#   breadth       상승 종목 비율  두 시장 합산 상승 종목 수 / 전체 종목 수 x 100 (백분위 아님)
#   foreign_flow  외국인 수급     두 시장 외국인 순매수 합 / 두 시장 거래대금 합 을 백분위로 (시장 규모 보정)
#   volatility    VKOSPI         100 - 백분위 (변동성이 높을수록 낮은 점수)
#   fx            원·달러 등락률  100 - 백분위 (원화 약세일수록 낮은 점수)
# 비교 분포(references)는 점수를 매기는 거래일(market_date) "이전" 거래일로만 만든다 (그날 장중 값이 분포에 섞이지 않게)
# 분포는 market_date가 바뀔 때만 새로 만들고, 같은 거래일 재계산은 현재값만 바꾼다

import logging
from datetime import UTC, date, datetime, timedelta
from threading import Lock
from zoneinfo import ZoneInfo

from backend.core import kis_client
from backend.domain.market.schemas.sentiment import SentimentResponse

logger = logging.getLogger(__name__)

# KIS 조회 코드 (업종코드: 코스피·코스닥·VKOSPI / 환율 구분·심볼)
_KOSPI = "0001"
_KOSDAQ = "1001"
_VKOSPI = "0503"
_FX_MARKET = "X"
_FX_SYMBOL = "FX@KRW"

# 비교 분포에 쓰는 최근 거래일 수와 최소 필요 일수. 최소보다 적으면 계산하지 않는다(ValueError)
# _REFERENCE_DAYS를 늘리면 더 긴 기간과 비교하지만 KIS 일별 응답(최대 100행) 안이어야 한다
_REFERENCE_DAYS = 60
_MIN_REFERENCE_DAYS = 20
_KST = ZoneInfo("Asia/Seoul")

# 항목별 가중치 (합이 1.0이어야 점수가 0~100 안에 머문다). 바꾸면 점수 구성이 바뀐다
_WEIGHTS = {
    "momentum": 0.30,
    "breadth": 0.25,
    "foreign_flow": 0.20,
    "volatility": 0.15,
    "fx": 0.10,
}

# 마지막 정상 점수 {score, market_date, updated_at}와 그날의 비교 분포. 예약 작업(스레드)과 요청이 동시에 읽고 써서 잠금을 둔다
_cache: dict | None = None
_reference_cache: dict | None = None
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


# 응답 행의 날짜("YYYYMMDD" - API마다 칸 이름이 달라 세 가지를 본다)를 date로. 없으면 None
def _day(row: dict) -> date | None:
    raw = str(row.get("stck_bsop_date") or row.get("bass_dt") or row.get("xymd") or "")
    return datetime.strptime(raw, "%Y%m%d").date() if len(raw) == 8 and raw.isdigit() else None


# 일별 응답(output2) -> {날짜: 행}
def _dated_rows(raw: dict) -> dict[date, dict]:
    return {day: row for row in (raw.get("output2") or []) if (day := _day(row)) is not None}


# 일별 응답의 가장 최근 거래일. 행이 없으면 ValueError
def _latest_market_date(raw: dict) -> date:
    rows = _dated_rows(raw)
    if not rows:
        raise ValueError("KIS 국내 지수 거래일이 비어 있습니다.")
    return max(rows)


# value가 references 분포에서 몇 백분위인지 (0~100, 같은 값은 절반만 센다). 분포가 _MIN_REFERENCE_DAYS보다 적으면 ValueError
def _percentile(value: float, references: list[float]) -> float:
    values = sorted(item for item in references if item is not None)
    if len(values) < _MIN_REFERENCE_DAYS:
        raise ValueError(f"시장심리지수 기준 데이터가 부족합니다 ({len(values)}일).")
    below = sum(item < value for item in values)
    equal = sum(item == value for item in values)
    return 100 * (below + equal * 0.5) / len(values)


# 두 시장 일별 응답 -> (모멘텀 분포 최신부터 _REFERENCE_DAYS개, {날짜: 두 시장 거래대금 합}). before 날짜와 그 뒤 행은 뺀다
def _index_history(kospi: dict, kosdaq: dict, before: date) -> tuple[list[float], dict[date, float]]:
    kospi_rows, kosdaq_rows = _dated_rows(kospi), _dated_rows(kosdaq)
    common = sorted((day for day in set(kospi_rows) & set(kosdaq_rows) if day < before), reverse=True)
    momentum, turnover = [], {}
    for day in common:
        kospi_change = _number(kospi_rows[day], "bstp_nmix_prdy_ctrt")
        kosdaq_change = _number(kosdaq_rows[day], "bstp_nmix_prdy_ctrt")
        kospi_turnover = _number(kospi_rows[day], "acml_tr_pbmn")
        kosdaq_turnover = _number(kosdaq_rows[day], "acml_tr_pbmn")
        if kospi_change is not None and kosdaq_change is not None:
            momentum.append(kospi_change * 0.7 + kosdaq_change * 0.3)
        if kospi_turnover is not None and kosdaq_turnover is not None and kospi_turnover + kosdaq_turnover > 0:
            turnover[day] = kospi_turnover + kosdaq_turnover
    return momentum[:_REFERENCE_DAYS], turnover


# 외국인 순매수 합 / 거래대금 합 분포 (최신부터 _REFERENCE_DAYS개). 세 자료에 모두 있는 날만 쓴다
#   kospi·kosdaq  투자자 매매동향 응답 (행이 output에 온다), turnover  _index_history의 날짜별 거래대금
def _foreign_history(kospi: dict, kosdaq: dict, turnover: dict[date, float]) -> list[float]:
    kospi_rows = {day: row for row in (kospi.get("output") or []) if (day := _day(row)) is not None}
    kosdaq_rows = {day: row for row in (kosdaq.get("output") or []) if (day := _day(row)) is not None}
    values = []
    for day in sorted(set(kospi_rows) & set(kosdaq_rows) & set(turnover), reverse=True):
        first = _number(kospi_rows[day], "frgn_ntby_tr_pbmn")
        second = _number(kosdaq_rows[day], "frgn_ntby_tr_pbmn")
        if first is not None and second is not None:
            values.append((first + second) / turnover[day])
    return values[:_REFERENCE_DAYS]


# 일별 응답의 값 자체 분포 (최신부터 _REFERENCE_DAYS개, 0 이하 제외) - VKOSPI. before 날짜와 그 뒤 행은 뺀다
def _level_history(raw: dict, before: date, *keys: str) -> list[float]:
    rows = sorted(((day, row) for day, row in _dated_rows(raw).items() if day < before), reverse=True)
    return [value for _, row in rows if (value := _number(row, *keys)) is not None and value > 0][:_REFERENCE_DAYS]


# 일별 응답의 전일 대비 등락률(%) 분포 (최신부터 _REFERENCE_DAYS개) - 환율
#   before  주면 이 날짜와 그 뒤에 끝나는 등락률은 뺀다 (비교 분포용). None이면 전부 (가장 최근 등락률이 필요할 때)
def _change_history(raw: dict, *keys: str, before: date | None = None) -> list[float]:
    rows = sorted(_dated_rows(raw).items())
    prices = [(day, value) for day, row in rows if (value := _number(row, *keys)) is not None and value > 0]
    changes = [100 * (current / previous - 1) for (_, previous), (day, current) in zip(prices, prices[1:]) if previous > 0 and (before is None or day < before)]
    return list(reversed(changes))[:_REFERENCE_DAYS]


# 계산에 필요한 KIS 원본을 모은다 (KIS 5회, investor_raw가 없으면 7회)
#   investor_raw  investor_flow_service.refresh가 돌려준 원본. 넘기면 투자자 매매동향을 다시 부르지 않는다
def _fetch_raw(today: date, investor_raw: dict | None = None) -> dict:
    start = today - timedelta(days=120)
    ymd = today.strftime("%Y%m%d")
    raw = {
        "kospi": kis_client.get_index_daily_price(_KOSPI, ymd, "D"),
        "kosdaq": kis_client.get_index_daily_price(_KOSDAQ, ymd, "D"),
        "vkospi": kis_client.get_index_daily_price(_VKOSPI, ymd, "D"),
        "fx_history": kis_client.get_overseas_period_price(_FX_MARKET, _FX_SYMBOL, start.strftime("%Y%m%d"), ymd, "D"),
        "fx_current": kis_client.get_overseas_index_or_fx_price(_FX_MARKET, _FX_SYMBOL),
    }
    raw.update(
        investor_raw
        or {
            "foreign_kospi": kis_client.get_investor_daily_by_market(ymd, "KSP", _KOSPI),
            "foreign_kosdaq": kis_client.get_investor_daily_by_market(ymd, "KSQ", _KOSDAQ),
        }
    )
    return raw


# 비교 분포 dict {market_date, momentum, foreign_flow, volatility, fx}. market_date보다 앞선 거래일만 쓴다
# 한 항목이라도 _MIN_REFERENCE_DAYS보다 적으면 ValueError
def _build_references(raw: dict, market_date: date) -> dict:
    momentum, turnover = _index_history(raw["kospi"], raw["kosdaq"], market_date)
    references = {
        "market_date": market_date,
        "momentum": momentum,
        # turnover가 이미 market_date 이전 날짜만 가지므로 외국인 분포도 이전 거래일만 남는다
        "foreign_flow": _foreign_history(raw["foreign_kospi"], raw["foreign_kosdaq"], turnover),
        "volatility": _level_history(raw["vkospi"], market_date, "bstp_nmix_prpr"),
        "fx": _change_history(raw["fx_history"], "ovrs_nmix_prpr", "stck_clpr", before=market_date),
    }
    for name in ("momentum", "foreign_flow", "volatility", "fx"):
        if len(references[name]) < _MIN_REFERENCE_DAYS:
            raise ValueError(f"시장심리지수 {name} 기준 데이터가 부족합니다 ({len(references[name])}일).")
    return references


# 지금 값 (모멘텀, 상승 종목 비율 %, 두 시장 거래대금 합). 일별 응답의 output1(최근 거래일 현재값)을 쓴다
def _current_index(raw: dict) -> tuple[float, float, float]:
    kospi, kosdaq = raw["kospi"].get("output1") or {}, raw["kosdaq"].get("output1") or {}
    kospi_change = _number(kospi, "bstp_nmix_prdy_ctrt")
    kosdaq_change = _number(kosdaq, "bstp_nmix_prdy_ctrt")
    if kospi_change is None or kosdaq_change is None:
        raise ValueError("코스피·코스닥 현재 등락률이 비어 있습니다.")

    rising = (_number(kospi, "ascn_issu_cnt") or 0) + (_number(kosdaq, "ascn_issu_cnt") or 0)
    falling = (_number(kospi, "down_issu_cnt") or 0) + (_number(kosdaq, "down_issu_cnt") or 0)
    flat = (_number(kospi, "stnr_issu_cnt") or 0) + (_number(kosdaq, "stnr_issu_cnt") or 0)
    if rising + falling + flat <= 0:
        raise ValueError("코스피·코스닥 상승·하락 종목 수가 비어 있습니다.")
    return kospi_change * 0.7 + kosdaq_change * 0.3, 100 * rising / (rising + falling + flat), (_number(kospi, "acml_tr_pbmn") or 0) + (_number(kosdaq, "acml_tr_pbmn") or 0)


# 지금 외국인 순매수 합 / 거래대금 합. market_date 행이 두 시장 중 하나라도 없으면 ValueError
def _current_foreign(raw: dict, market_date: date, turnover: float) -> float:
    if turnover <= 0:
        raise ValueError("현재 시장 거래대금이 비어 있습니다.")
    total = 0.0
    for key in ("foreign_kospi", "foreign_kosdaq"):
        rows = _dated_rows({"output2": raw[key].get("output") or []})
        row = rows.get(market_date)
        value = _number(row or {}, "frgn_ntby_tr_pbmn")
        if value is None:
            raise ValueError(f"{market_date} 외국인 순매수 값이 비어 있습니다.")
        total += value
    return total / turnover


# 지금 원·달러 등락률(%). 현재가 응답에 없으면 일별 분포의 가장 최근 값으로 대신한다
def _current_fx_change(raw: dict) -> float:
    current = raw["fx_current"].get("output1") or {}
    change = _number(current, "prdy_ctrt")
    if change is not None:
        return change
    history = _change_history(raw["fx_history"], "ovrs_nmix_prpr", "stck_clpr")
    if not history:
        raise ValueError("원·달러 환율 등락률이 비어 있습니다.")
    return history[0]


# 원본과 비교 분포 -> 캐시 dict {score(소수 1자리, 0~100), market_date, updated_at}
#   market_date  점수를 매기는 거래일 (코스피 일별 응답의 가장 최근 날짜)
def _calculate(raw: dict, references: dict, market_date: date) -> dict:
    momentum, breadth, turnover = _current_index(raw)
    foreign_flow = _current_foreign(raw, market_date, turnover)
    volatility = _number(raw["vkospi"].get("output1") or {}, "bstp_nmix_prpr")
    if volatility is None or volatility <= 0:
        raise ValueError("VKOSPI 현재값이 비어 있습니다.")
    fx_change = _current_fx_change(raw)

    components = {
        "momentum": _percentile(momentum, references["momentum"]),
        "breadth": breadth,
        "foreign_flow": _percentile(foreign_flow, references["foreign_flow"]),
        "volatility": 100 - _percentile(volatility, references["volatility"]),
        "fx": 100 - _percentile(fx_change, references["fx"]),
    }
    score = sum(components[name] * weight for name, weight in _WEIGHTS.items())
    return {"score": round(max(0, min(100, score)), 1), "market_date": market_date, "updated_at": datetime.now(UTC)}


# 점수를 다시 계산해 캐시를 바꾼다. 비교 분포는 점수를 매기는 거래일이 바뀌었을 때만 새로 만든다
# (장 시작 전에는 전 거래일 확정값, 09:00 첫 갱신부터 오늘 값이 기준이 되어 분포를 한 번 다시 만든다)
# 실패하면 예외를 올리고 기존 캐시는 그대로 둔다
def refresh(investor_raw: dict | None = None) -> None:
    global _cache, _reference_cache
    today = datetime.now(_KST).date()
    raw = _fetch_raw(today, investor_raw)
    market_date = _latest_market_date(raw["kospi"])
    with _lock:
        references = _reference_cache
    if references is None or references["market_date"] != market_date:
        references = _build_references(raw, market_date)

    parsed = _calculate(raw, references, market_date)
    with _lock:
        _reference_cache = references
        _cache = parsed
    logger.info("개미굴 시장심리지수 갱신 완료 - %.1f점 (%s)", parsed["score"], parsed["market_date"])


# 캐시를 응답으로. 아직 한 번도 갱신되지 않았으면 None (라우터가 503)
def get_sentiment() -> SentimentResponse | None:
    with _lock:
        cached = dict(_cache) if _cache is not None else None
    return SentimentResponse(**cached) if cached is not None else None
