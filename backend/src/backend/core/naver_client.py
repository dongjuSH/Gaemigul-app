# naver_client.py
# 네이버 뉴스 검색 API 호출 (전 도메인 공용). NCP의 NAVER API HUB 주소·키를 쓴다. 하루 25,000회 한도.

import time

import httpx

from backend.core.config import get_settings

_NEWS_ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/news"

# 실패 시 재시도 횟수, 대기(초, 시도마다 배수로 늘어남), 요청 타임아웃(초)
_RETRY_COUNT = 3
_RETRY_WAIT_SECONDS = 0.5
_TIMEOUT_SECONDS = 10.0


# 뉴스 검색
#   query    검색어 (필수)
#   display  받을 기사 수 (1~100)
#   sort     "sim" 정확도순 / "date" 최신순 (date는 검색어와 무관한 기사가 섞인다)
# 응답 items: title / description (검색어가 <b>로 감싸져 온다) / link (네이버 뉴스 주소 또는 원문) /
#             originallink (언론사 원문) / pubDate
# 5xx·연결 오류는 재시도하고 4xx는 바로 에러를 낸다. 키가 없으면 RuntimeError
def search_news(query: str, display: int = 10, sort: str = "sim") -> dict:
    settings = get_settings()
    if not settings.naver_api_key_id or not settings.naver_api_key:
        raise RuntimeError("NAVER_API_KEY_ID / NAVER_API_KEY가 .env에 없습니다. backend/.env에 추가해주세요.")

    last_error = None
    for attempt in range(_RETRY_COUNT):
        try:
            response = httpx.get(
                _NEWS_ENDPOINT,
                headers={
                    "X-NCP-APIGW-API-KEY-ID": settings.naver_api_key_id,
                    "X-NCP-APIGW-API-KEY": settings.naver_api_key,
                },
                params={"query": query, "display": display, "sort": sort},
                timeout=_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as error:
            if error.response.status_code < 500:
                raise
            last_error = error
        except httpx.TransportError as error:
            last_error = error

        if attempt < _RETRY_COUNT - 1:
            time.sleep(_RETRY_WAIT_SECONDS * (attempt + 1))

    raise last_error
