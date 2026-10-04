# llm_client.py
# 제미나이 API 호출 (전 도메인 공용). 텍스트 응답(generate)과 JSON 응답(generate_json)을 제공한다.

import json
import re
import time

import httpx

from backend.core.config import get_settings

# 기본 모델. 바꾸면 model을 따로 지정하지 않은 모든 LLM 호출이 그 모델로 간다
# 무료 한도는 모델별로 따로다 (gemini-3.5-flash-lite 하루 200회, gemini-3.6-flash 하루 20회)
DEFAULT_MODEL = "gemini-3.5-flash-lite"
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# 실패 시 재시도 횟수와 대기(초). 호출 한 번이 수십 초 걸릴 수 있어 횟수를 적게 둔다
_RETRY_COUNT = 2
_RETRY_WAIT_SECONDS = 1.0


# 프롬프트를 보내고 생성된 텍스트를 돌려받는다
# model: 비우면 DEFAULT_MODEL. 호출 수가 적고 품질이 중요한 곳(보고서)만 다른 모델을 넘긴다
# 5xx·429(한도)·타임아웃은 재시도하고, 그 외 4xx는 바로 에러를 낸다. 키가 없으면 RuntimeError
def generate(prompt: str, timeout: float = 60.0, model: str | None = None) -> str:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY가 .env에 없습니다. backend/.env에 추가해주세요.")

    last_error = None
    for attempt in range(_RETRY_COUNT):
        try:
            response = httpx.post(
                _ENDPOINT.format(model=model or DEFAULT_MODEL),
                headers={
                    "x-goog-api-key": settings.gemini_api_key,
                    "content-type": "application/json",
                },
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()["candidates"][0]["content"]["parts"][0]["text"]
        except httpx.HTTPStatusError as error:
            if error.response.status_code < 500 and error.response.status_code != 429:
                raise
            last_error = error
        except httpx.TransportError as error:
            last_error = error

        if attempt < _RETRY_COUNT - 1:
            time.sleep(_RETRY_WAIT_SECONDS)

    raise last_error


# 프롬프트를 보내고 결과를 dict로 돌려받는다
# 응답을 감싼 ```json 코드블록과 앞뒤 설명 문장을 벗겨내고 파싱한다. JSON이 아니면 ValueError
def generate_json(prompt: str, timeout: float = 60.0, model: str | None = None) -> dict:
    text = generate(prompt, timeout=timeout, model=model).strip()

    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)

    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"LLM 응답에서 JSON을 찾지 못했습니다: {text[:200]}")

    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as error:
        raise ValueError(f"LLM 응답을 JSON으로 읽지 못했습니다: {text[:200]}") from error
