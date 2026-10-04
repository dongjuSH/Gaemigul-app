# kis_token_store.py
# KIS 접근 토큰을 DB 한 행에 보관한다 (전 도메인·전 기기 공용). kis_client만 사용한다.
#   read    유효한 (토큰, 만료 시각) (없거나 만료면 None)
#   write   발급받은 토큰 저장 (성공하면 True)
#   invalidate  KIS가 거절한 토큰을 만료 처리 (저장된 토큰이 그 토큰일 때만)
#
# 토큰은 계좌 단위라 기기마다 따로 발급하면 계좌 주인에게 알림이 그만큼 간다.
# DB에 두면 팀원 PC와 배포 서버가 같은 토큰을 쓰므로 하루 한 번만 발급된다 (배포로 파일이 지워져도 유지된다).
# 여기서만 동기 드라이버(psycopg)를 쓴다 - kis_client가 동기 코드이고 예약 작업이 이벤트 루프 안에서도 부르기 때문에,
# 비동기 엔진(asyncpg)을 쓰면 "다른 이벤트 루프" 오류가 난다.
# 실패하면 예외를 올리지 않고 경고만 남긴다 (kis_client가 파일 캐시로 넘어간다).

import logging

import psycopg

from backend.core.config import get_settings

logger = logging.getLogger(__name__)

# 토큰 한 행만 두는 표. 없으면 만든다 (create_tables.py는 비동기 ORM용이라 여기서 직접 만든다)
_TABLE = "kis_token"
_CREATE_SQL = f"""
CREATE TABLE IF NOT EXISTS {_TABLE} (
    id smallint PRIMARY KEY,
    access_token text NOT NULL,
    expires_at double precision NOT NULL,
    updated_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')
)
"""


# SQLAlchemy용 주소("postgresql+asyncpg://...")를 psycopg용("postgresql://...")으로 바꾼다. DATABASE_URL이 없으면 None
def _dsn() -> str | None:
    url = get_settings().database_url
    return url.replace("+asyncpg", "") if url else None


# DB를 쓸 수 있는지 (DATABASE_URL이 있는지)
def enabled() -> bool:
    return _dsn() is not None


# 저장된 (토큰, 만료 시각 epoch). 없거나 now보다 만료가 빠르면 None. 연결 실패도 None (호출부가 파일 캐시로 넘어간다)
def read(now: float) -> tuple[str, float] | None:
    dsn = _dsn()
    if dsn is None:
        return None
    try:
        with psycopg.connect(dsn, connect_timeout=5) as conn, conn.cursor() as cur:
            cur.execute(_CREATE_SQL)
            cur.execute(f"SELECT access_token, expires_at FROM {_TABLE} WHERE id = 1")
            row = cur.fetchone()
        if row and row[1] > now:
            return row[0], row[1]
    except Exception as error:  # psycopg 연결·권한·네트워크 오류 전부
        logger.warning("KIS 토큰 DB 조회 실패, 파일 캐시로 진행합니다 - %s: %s", type(error).__name__, error)
    return None


# 토큰을 저장한다 (한 행을 덮어쓴다). 성공하면 True
def write(access_token: str, expires_at: float) -> bool:
    dsn = _dsn()
    if dsn is None:
        return False
    try:
        with psycopg.connect(dsn, connect_timeout=5) as conn, conn.cursor() as cur:
            cur.execute(_CREATE_SQL)
            cur.execute(
                f"""
                INSERT INTO {_TABLE} (id, access_token, expires_at, updated_at)
                VALUES (1, %s, %s, now() AT TIME ZONE 'Asia/Seoul')
                ON CONFLICT (id) DO UPDATE SET access_token = EXCLUDED.access_token, expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at
                """,
                (access_token, expires_at),
            )
        return True
    except Exception as error:
        logger.warning("KIS 토큰 DB 저장 실패, 파일 캐시만 씁니다 - %s: %s", type(error).__name__, error)
    return False


# 저장된 토큰이 access_token과 같을 때만 만료 처리한다. 성공하면 True
# 다른 기기가 이미 새 토큰으로 바꿔 놓았으면 그 토큰은 건드리지 않는다 (새 토큰까지 버리면 발급이 한 번 더 일어난다)
def invalidate(access_token: str) -> bool:
    dsn = _dsn()
    if dsn is None:
        return False
    try:
        with psycopg.connect(dsn, connect_timeout=5) as conn, conn.cursor() as cur:
            cur.execute(_CREATE_SQL)
            cur.execute(
                f"UPDATE {_TABLE} SET expires_at = 0, updated_at = now() AT TIME ZONE 'Asia/Seoul' WHERE id = 1 AND access_token = %s",
                (access_token,),
            )
        return True
    except Exception as error:
        logger.warning("KIS 토큰 DB 만료 처리 실패 - %s: %s", type(error).__name__, error)
    return False
