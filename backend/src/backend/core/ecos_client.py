# ecos_client.py
# 한국은행 ECOS(경제통계시스템) Open API 직접 호출
#
# core에 있는 이유: fred_client.py/dart_client.py와 같은 팀 규칙 - API 호출 코드는 도메인
# 안에 두지 않고 core에 모아서 전역으로 쓴다(2026-09-10).
#
# ECOS 응답은 HTTP 상태와 무관하게 정상/에러 형태가 서로 다르다(46번 사전조사에서 실제 라이브
# 호출로 확인) - 정상이면 {"StatisticSearch": {"list_total_count", "row": [...]}}, 에러면
# {"RESULT": {"CODE", "MESSAGE"}}. 인증키를 "sample"로 주면 실제 데이터가 오지만 한 번에
# 최대 10건까지만 조회된다(46번 사전조사에서 확인) - 정식 키가 없을 때의 대체 수단이다.
#
# 중요: ECOS는 "그 달/그 날의 값이 얼마였는지"만 주는 순수 통계 DB다. "몇 월 며칠에 결정됐는지"는
# 이 API로 알 수 없다 - 값이 바뀐 지점(월)을 찾아낸 뒤, 정확한 결정일은 한국은행 공식
# 홈페이지에서 확인한 값을 services/calendar.py의 정적 표로 따로 매핑해야 한다(FOMC를
# federalreserve.gov 공식 캘린더로 매핑하는 것과 같은 구조).

from __future__ import annotations

import httpx

from backend.core.config import get_settings

_BASE_URL = "https://ecos.bok.or.kr/api"

# 1.3.1. 한국은행 기준금리 및 여수신금리
_BASE_RATE_STAT_CODE = "722Y001"
# 한국은행 기준금리
_BASE_RATE_ITEM_CODE = "0101000"

# 요청 타임아웃(초) - 명시하지 않으면 httpx 기본값을 쓰게 된다
_TIMEOUT_SECONDS = 10.0


class EcosApiError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"ECOS API 오류 [{code}]: {message}")


# 한국은행 기준금리 월별 시계열 조회 (StatisticSearch, 통계표 722Y001 / 통계항목 0101000 / 주기 M).
# start/end는 "YYYYMM" 형식. 반환 각 행에는 최소 TIME/DATA_VALUE/ITEM_CODE1/ITEM_NAME1/
# UNIT_NAME이 들어있다(ECOS 원본 필드명을 그대로 유지 - 임의로 이름을 바꾸지 않는다).
def get_base_rate_series(start: str, end: str) -> list[dict]:
    settings = get_settings()
    api_key = settings.ecos_api_key or "sample"

    # ECOS는 인증키를 쿼리가 아니라 URL 경로 자체에 넣는 구조라, 요청이 실패했을 때 httpx의
    # 기본 예외 메시지(요청 URL을 그대로 포함)를 그대로 내보내면 안 된다 - 경로에 키가 그대로
    # 남아 로그에 평문으로 노출된다(FRED의 api_key 노출과 같은 문제, 쿼리가 아니라 경로라 더 위험).
    url = (
        f"{_BASE_URL}/StatisticSearch/{api_key}/json/kr/1/100/"
        f"{_BASE_RATE_STAT_CODE}/M/{start}/{end}/{_BASE_RATE_ITEM_CODE}"
    )
    try:
        response = httpx.get(url, timeout=_TIMEOUT_SECONDS)
    except httpx.HTTPError as error:
        raise EcosApiError("REQUEST_FAILED", f"ECOS 요청 실패 - {type(error).__name__}") from None

    if response.status_code >= 400:
        raise EcosApiError("HTTP_ERROR", f"ECOS 요청 실패 - status={response.status_code}") from None

    body = response.json()

    if "RESULT" in body:
        result = body["RESULT"]
        raise EcosApiError(result.get("CODE", "UNKNOWN"), result.get("MESSAGE", "알 수 없는 오류"))

    search = body.get("StatisticSearch")
    if search is None:
        return []

    return search.get("row", [])
