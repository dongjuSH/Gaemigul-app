# investor_flow_service.py
# 메인 페이지 개인·기관·외국인 순매수 금액(코스피+코스닥 합산)을 메모리 캐시에 보관한다.
#   fetch_raw            KIS 투자자 매매동향 원본 두 건(코스피·코스닥)을 받는다
#   refresh              원본으로 캐시를 바꾸고 원본을 돌려준다 (sentiment_service가 같은 원본을 재사용한다)
#   get_investor_flow    캐시 읽기 (GET /market/investor-flow). KIS를 호출하지 않는다
# 금액 단위는 KIS 원본 그대로 백만원, 음수 = 순매도 / 양수 = 순매수

import logging
from datetime import UTC, date, datetime
from threading import Lock
from zoneinfo import ZoneInfo

from backend.core import kis_client
from backend.domain.market.schemas.investor_flow import InvestorFlowResponse

logger = logging.getLogger(__name__)

_KST = ZoneInfo("Asia/Seoul")

# 마지막 정상값 {individual, institution, foreign, unit, market_date, updated_at}. 예약 작업(스레드)과 요청이 동시에 읽고 써서 잠금을 둔다
_cache: dict | None = None
_lock = Lock()


# 응답 칸의 숫자 문자열("-1,234")을 int로. 비었거나 숫자가 아니면 None
def _number(row: dict, key: str) -> int | None:
    raw = row.get(key)
    if raw in (None, ""):
        return None
    try:
        return int(float(str(raw).replace(",", "")))
    except ValueError:
        return None


# 응답 행의 날짜(stck_bsop_date "YYYYMMDD")를 date로. 없으면 None
def _day(row: dict) -> date | None:
    raw = str(row.get("stck_bsop_date") or "")
    return datetime.strptime(raw, "%Y%m%d").date() if len(raw) == 8 and raw.isdigit() else None


# 코스피·코스닥 투자자 매매동향 원본을 한 번씩 받는다 (KIS 2회). 키 이름은 sentiment_service도 그대로 쓴다
#   today  기준일. 이 날짜부터 거슬러 최근 거래일들이 온다
def fetch_raw(today: date) -> dict:
    ymd = today.strftime("%Y%m%d")
    return {
        "foreign_kospi": kis_client.get_investor_daily_by_market(ymd, "KSP", "0001"),
        "foreign_kosdaq": kis_client.get_investor_daily_by_market(ymd, "KSQ", "1001"),
    }


# 원본 -> 캐시 dict. 두 시장에 모두 있는 가장 최근 날짜의 주체별 금액을 더한다
# 한 시장이라도 비었거나 그날 금액 칸이 비면 ValueError (한쪽만 더한 값을 내보내지 않는다)
def _parse(raw: dict) -> dict:
    rows_by_market: list[dict[date, dict]] = []
    for key in ("foreign_kospi", "foreign_kosdaq"):
        dated = {day: row for row in raw[key].get("output") or [] if (day := _day(row)) is not None}
        if not dated:
            raise ValueError(f"KIS {key} 투자자 수급이 비어 있습니다.")
        rows_by_market.append(dated)

    common_days = set(rows_by_market[0]) & set(rows_by_market[1])
    if not common_days:
        raise ValueError("코스피·코스닥의 공통 수급 거래일이 없습니다.")
    market_date = max(common_days)

    # 응답 키 -> KIS 칸 (순매수 거래대금)
    keys = {
        "individual": "prsn_ntby_tr_pbmn",
        "institution": "orgn_ntby_tr_pbmn",
        "foreign": "frgn_ntby_tr_pbmn",
    }
    values: dict[str, int] = {}
    for name, source_key in keys.items():
        amounts = [_number(rows[market_date], source_key) for rows in rows_by_market]
        if any(amount is None for amount in amounts):
            raise ValueError(f"{market_date} {name} 순매수 금액이 비어 있습니다.")
        values[name] = sum(amount for amount in amounts if amount is not None)

    return {
        **values,
        "unit": "million_krw",
        "market_date": market_date,
        "updated_at": datetime.now(UTC),
    }


# 캐시를 바꾸고 쓴 원본을 돌려준다. raw를 넘기면 KIS를 다시 부르지 않는다
# 실패하면 예외를 올리고 기존 캐시는 그대로 둔다
def refresh(raw: dict | None = None) -> dict:
    global _cache
    source = raw or fetch_raw(datetime.now(_KST).date())
    parsed = _parse(source)
    with _lock:
        _cache = parsed
    # logging의 %-포맷은 천 단위 쉼표를 못 붙여 문자열로 미리 만든다
    logger.info(
        "투자자 수급 갱신 완료 - 개인 %s / 기관 %s / 외국인 %s백만원 (%s)",
        f'{parsed["individual"]:+,}',
        f'{parsed["institution"]:+,}',
        f'{parsed["foreign"]:+,}',
        parsed["market_date"],
    )
    return source


# 캐시를 응답으로. 아직 한 번도 갱신되지 않았으면 None (라우터가 503)
def get_investor_flow() -> InvestorFlowResponse | None:
    with _lock:
        cached = dict(_cache) if _cache is not None else None
    return InvestorFlowResponse(**cached) if cached is not None else None
