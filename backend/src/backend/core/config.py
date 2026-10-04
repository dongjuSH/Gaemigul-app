# config.py
# backend/.env 값을 읽어 설정 객체로 제공한다 (전 도메인 공용). 설정은 항상 get_settings()로 가져온다.

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# .env의 키 이름(대소문자 무관)과 필드 이름이 같으면 자동으로 채워진다
# 키는 전부 선택값(None 허용)이다. 키가 없어도 서버는 뜨고, 그 키를 쓰는 클라이언트를 호출할 때만 에러가 난다
# 새 키를 추가하려면: 여기에 필드 추가 -> .env.example에 같은 이름 추가 -> 쓰는 클라이언트에 "키 없으면 RuntimeError" 추가
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 한국투자증권 오픈API (timeline 지표 바·슬롯·보고서, market 메인 페이지 데이터)
    kis_app_key: str | None = None
    kis_app_secret: str | None = None
    kis_base_url: str = "https://openapi.koreainvestment.com:9443"

    # 히트맵 수집 설정. 시세 조회만 사용하며 기존 KIS 계정/토큰을 함께 쓴다.
    heatmap_enabled: bool = True
    # 전 도메인이 공유하는 KIS 조회 속도(초당). 기존 환경변수 이름을 유지하며 계정 한도에 맞춰 낮출 수 있다.
    heatmap_requests_per_second: float = Field(default=5.0, gt=0, le=20)
    # 수능일 등 특별 거래시간은 KRX 공지에 맞춰 날짜별로 지정한다(한국 시간).
    # 예: {"2026-01-02": {"open": "10:00", "close": "15:30"}}
    heatmap_session_overrides: dict[str, dict[str, str]] = Field(default_factory=dict)

    # 네이버 클라우드 플랫폼(NCP) 뉴스 검색 키 (developers.naver.com 키와 다름) (timeline 뉴스)
    naver_api_key_id: str | None = None
    naver_api_key: str | None = None

    # 제미나이 API (timeline 브리핑·해설·보고서, calendar)
    gemini_api_key: str | None = None

    # Supabase Postgres 연결 문자열. "postgresql+asyncpg://"로 시작해야 한다
    database_url: str | None = None

    # 관리용 POST(수집·보고서 생성) 호출 키. 요청 헤더 X-Admin-Key와 비교한다
    # 비워 두면 그 POST들은 503으로 막힌다 (배포 주소가 공개돼도 아무나 못 부르게)
    admin_api_key: str | None = None

    # Pollinations 이미지 생성 (timeline 보고서 이미지). 키(sk_)는 서버에서만 쓴다. 모델 id를 바꾸면 화풍·비용이 바뀐다
    pollinations_api_key: str | None = None
    pollinations_image_model: str = "z-image-turbo"

    # FRED(미국 연준 경제 데이터) API - calendar 도메인에서 사용
    fred_api_key: str | None = None

    # DART(전자공시시스템) Open API - calendar 도메인에서 기업 실적 발표일 조사용(테스트 단계)
    dart_api_key: str | None = None

    # Supabase Storage 파일 업로드 (timeline 보고서 이미지). URL은 "https://프로젝트ID.supabase.co"
    # 서비스 키는 DB 전체 권한이라 서버에서만 쓴다 (프런트·깃에 넣지 말 것)
    supabase_url: str | None = None
    supabase_service_key: str | None = None

    # 한국은행 ECOS(경제통계시스템) Open API - calendar 도메인에서 한국 기준금리 조사용(테스트 단계)
    # 인증키가 없으면 "sample"로도 호출 가능하지만 sample은 조회건수가 최대 10건으로 제한된다
    # (ecos.bok.or.kr에서 발급받은 정식 키가 있으면 .env에 넣을 것)
    ecos_api_key: str | None = None

    # 세션 쿠키(auth 도메인). 로컬(프론트·백엔드 둘 다 localhost)은 secure=false, samesite=lax로 충분하다.
    # 실제 배포(서로 다른 도메인)로 넘어가면 secure=true, samesite=none + 백엔드 HTTPS가 필요하다 - 그때 다시 논의
    session_cookie_name: str = "session_id"
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    session_ttl_days: int = 14

    # 개미레터(뉴스레터) 본문에 넣는 사이트 링크. 배포 도메인이 생기면 .env에서 덮어쓴다
    frontend_url: str = "http://localhost:3000"

    # 이메일 발송(SMTP) - 아이디/비밀번호 찾기, 개미레터가 공용으로 쓴다 (services/email_service.py)
    # 키가 하나라도 없으면 발송을 시도하지 않고 로그 스텁처럼 콘솔에만 남긴다(로컬 개발 편의)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None


# 설정을 한 번만 읽어 재사용한다 (.env를 바꾸면 서버를 재시작해야 반영된다)
@lru_cache
def get_settings() -> Settings:
    return Settings()
