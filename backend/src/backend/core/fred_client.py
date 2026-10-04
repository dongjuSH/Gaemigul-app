# fred_client.py
# FRED(미국 연방준비제도 경제 데이터) API 직접 호출
#
# core에 있는 이유: kis_client.py와 같은 팀 규칙 - 여러 도메인이 같이 쓸 수 있도록
# API 호출 코드는 도메인 안에 두지 않고 core에 모아서 전역으로 쓴다(2026-09-10).
#
# 재시도: kis_client._send_with_retry와 같은 원칙(5xx·timeout만 재시도, 4xx는 즉시 실패,
# 재시도마다 backoff를 늘림) - 매시 정각에 다른 예약 작업과 FRED 호출이 몰릴 때 FRED가
# 간헐적으로 5xx를 주는 것이 실제로 확인되어(calendar_fomc가 매시 0분에 반복 실패) 추가했다.
# 모든 공개 함수가 _get()을 거치므로 이 보호가 공통으로 적용된다.
#
# 보안: response.raise_for_status()는 쓰지 않는다 - 그 예외 메시지에 api_key가 포함된 요청
# URL 전체가 그대로 담겨서, 로그에 API key가 평문으로 남는 사고로 이어진다(실제로 발생함).
# 상태 코드를 직접 확인해서 path/series_id 등 안전한 정보만 담은 메시지로 실패시킨다.

from __future__ import annotations

import logging
import time

import httpx

from backend.core.config import get_settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.stlouisfed.org/fred"

# 요청 타임아웃(초) - 명시하지 않으면 httpx 기본값(무제한에 가까움)을 쓰게 되어 응답이
# 느린 FRED 요청 하나가 예약 작업을 오래 붙잡을 수 있다
_TIMEOUT_SECONDS = 10.0

# 5xx·timeout 재시도 횟수와 재시도 간 대기(초, 시도마다 배수로 늘어난다)
_RETRY_COUNT = 3
_RETRY_WAIT_SECONDS = 0.5


class FredAPIError(RuntimeError):
    """FRED 요청이 재시도 후에도 최종 실패했을 때. 메시지에 api_key를 절대 포함하지 않는다."""

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        # 4xx/5xx 구분이 필요한 호출부(예: calendar.py의 추가 재시도 판단)가 쓴다. timeout처럼
        # 응답 자체를 못 받은 경우는 None
        self.status_code = status_code


def _get(path: str, **params: str | int) -> dict:
    settings = get_settings()
    request_params: dict[str, str | int] = {
        **params,
        "api_key": settings.fred_api_key,
        "file_type": "json",
    }
    # 로그·예외 메시지에 남겨도 안전한 컨텍스트만 뽑아둔다(api_key 제외) - 어떤 시계열/release
    # 조회였는지는 알아야 장애 원인을 추적할 수 있다
    context = params.get("series_id") or params.get("release_id")

    for attempt in range(_RETRY_COUNT):
        try:
            response = httpx.get(f"{_BASE_URL}{path}", params=request_params, timeout=_TIMEOUT_SECONDS)
        except httpx.TimeoutException:
            if attempt < _RETRY_COUNT - 1:
                logger.warning(
                    "FRED 요청 timeout, 재시도 %d/%d - path=%s context=%s", attempt + 1, _RETRY_COUNT, path, context
                )
                time.sleep(_RETRY_WAIT_SECONDS * 2**attempt)
                continue
            raise FredAPIError(
                f"FRED request timed out after {_RETRY_COUNT} attempts - path={path} context={context}"
            ) from None

        if response.status_code >= 500:
            if attempt < _RETRY_COUNT - 1:
                logger.warning(
                    "FRED request failed, retrying %d/%d - status=%d path=%s context=%s",
                    attempt + 1,
                    _RETRY_COUNT,
                    response.status_code,
                    path,
                    context,
                )
                time.sleep(_RETRY_WAIT_SECONDS * 2**attempt)
                continue
            raise FredAPIError(
                f"FRED request failed - status={response.status_code} path={path} context={context}",
                status_code=response.status_code,
            ) from None

        if response.status_code >= 400:
            # 4xx(인증 오류·잘못된 파라미터 등)는 재시도해도 성공하지 않으므로 즉시 실패시킨다
            raise FredAPIError(
                f"FRED request failed - status={response.status_code} path={path} context={context}",
                status_code=response.status_code,
            ) from None

        return response.json()

    # 위 루프는 각 시도마다 반드시 return/continue/raise 중 하나로 끝나므로 여기 도달하지
    # 않는다 - 방어적으로만 남겨둔다(kis_client._send_with_retry와 같은 스타일)
    raise FredAPIError(f"FRED request failed after {_RETRY_COUNT} attempts - path={path} context={context}")


# 시계열의 관측치를 조회. limit=2/sort_order="desc"(기본값)면 [최신값, 직전값] 순서로 온다.
# observation_start/end("YYYY-MM-DD")를 주면 그 기간의 관측치를 전부 가져올 수 있다 - 기간 밖의
# 미래 관측치는 FRED에 데이터 자체가 없어서 응답에 아예 안 나온다(임의 생성 위험 없음).
# realtime_start/end를 주면 "그 시점 스냅샷"의 데이터를 조회할 수 있다 - 특정 값이 실제로
# 언제 처음 등장했는지 확인할 때 쓴다(예: GDP처럼 한 분기에 발표가 여러 번 있는 지표에서
# 그중 어떤 발표일이 실제 그 값의 최초 발표일인지 검증할 때).
# value가 "."이면 해당 시점에 실제 값이 없다는 뜻 (FRED 자체 규칙)
def get_series_observations(
    series_id: str,
    *,
    limit: int = 2,
    sort_order: str = "desc",
    observation_start: str | None = None,
    observation_end: str | None = None,
    realtime_start: str | None = None,
    realtime_end: str | None = None,
) -> list[dict]:
    params: dict[str, str | int] = {
        "series_id": series_id,
        "sort_order": sort_order,
        "limit": limit,
    }
    if observation_start is not None:
        params["observation_start"] = observation_start
    if observation_end is not None:
        params["observation_end"] = observation_end
    if realtime_start is not None:
        params["realtime_start"] = realtime_start
    if realtime_end is not None:
        params["realtime_end"] = realtime_end

    body = _get("/series/observations", **params)
    return body["observations"]


# 이 시계열이 속한 release_id 조회 (release_id가 있어야 실제 발표일을 조회할 수 있다)
def get_series_release_id(series_id: str) -> int:
    body = _get("/series/release", series_id=series_id)
    return body["releases"][0]["id"]


# 해당 release의 실제 발표일(날짜만, 시각 없음)을 조회.
# include_release_dates_with_no_data=True를 줘야 "아직 데이터는 없지만 예정된" 미래 발표일까지
# 나온다 - 이게 없으면 이미 지나간 발표일만 나온다(FRED 자체 규칙, 실제 라이브 호출로 확인함).
def get_release_dates(
    release_id: int,
    *,
    limit: int = 1,
    sort_order: str = "desc",
    realtime_start: str | None = None,
    realtime_end: str | None = None,
    include_release_dates_with_no_data: bool = False,
) -> list[dict]:
    params: dict[str, str | int] = {
        "release_id": release_id,
        "sort_order": sort_order,
        "limit": limit,
    }
    if realtime_start is not None:
        params["realtime_start"] = realtime_start
    if realtime_end is not None:
        params["realtime_end"] = realtime_end
    if include_release_dates_with_no_data:
        params["include_release_dates_with_no_data"] = "true"

    body = _get("/release/dates", **params)
    return body["release_dates"]
