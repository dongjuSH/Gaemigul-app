# storage_client.py
# Supabase Storage 파일 업로드 (전 도메인 공용). 서비스 키로 올리고 공개 URL을 돌려준다.
# 공개 URL로 열리려면 버킷이 Public이어야 한다 (Supabase 대시보드 > Storage에서 설정)

import time

import httpx

from backend.core.config import get_settings

# 실패 시 재시도 횟수, 대기(초, 시도마다 배수로 늘어남), 요청 타임아웃(초)
_RETRY_COUNT = 3
_RETRY_WAIT_SECONDS = 0.5
_TIMEOUT_SECONDS = 30.0


# 파일을 올리고 공개 URL을 돌려준다
#   bucket        버킷 이름 (예: "report-images")
#   path          버킷 안 경로 (예: "daily/2026-09-14/main_daily_20260914.jpg"). 같은 경로가 있으면 덮어쓴다
#                 주의: 공개 URL은 CDN 캐시가 있어 덮어써도 한동안 옛 파일이 보인다.
#                 고정 파일명을 쓸 때는 호출부가 공개 URL에 버전 쿼리를 붙여 캐시를 갱신할 것
#   content       파일 바이트
#   content_type  예: "image/jpeg"
# 5xx·연결 오류는 재시도하고 4xx(버킷 없음·키 권한 부족 등)는 바로 에러를 낸다. 키가 없으면 RuntimeError
def upload_file(bucket: str, path: str, content: bytes, content_type: str) -> str:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_KEY가 .env에 없습니다. backend/.env에 추가해주세요.")

    base_url = settings.supabase_url.rstrip("/")
    last_error = None
    for attempt in range(_RETRY_COUNT):
        try:
            response = httpx.post(
                f"{base_url}/storage/v1/object/{bucket}/{path}",
                headers={
                    "apikey": settings.supabase_service_key,
                    "Authorization": f"Bearer {settings.supabase_service_key}",
                    "Content-Type": content_type,
                    "x-upsert": "true",  # 같은 경로면 덮어쓴다 (보고서 재생성 시 이미지 교체). "false"면 409 에러
                },
                content=content,
                timeout=_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            return f"{base_url}/storage/v1/object/public/{bucket}/{path}"
        except httpx.HTTPStatusError as error:
            if error.response.status_code < 500:
                raise
            last_error = error
        except httpx.TransportError as error:
            last_error = error

        if attempt < _RETRY_COUNT - 1:
            time.sleep(_RETRY_WAIT_SECONDS * (attempt + 1))

    raise last_error
