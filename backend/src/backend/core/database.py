# database.py
# DB 연결 (전 도메인 공용). 엔진·세션은 처음 쓸 때 만든다.
#   Base                  ORM 모델이 상속받는 클래스
#   get_engine            DB 엔진 (DATABASE_URL이 없으면 RuntimeError)
#   get_session_factory   세션을 만드는 함수 (스케줄러처럼 요청 밖에서 DB를 쓸 때)
#   get_db                라우터용 세션 의존성 - session: AsyncSession = Depends(get_db)

from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.core.config import get_settings


# 모든 ORM 모델의 부모 클래스 (DB 연결 없이도 import 가능)
class Base(DeclarativeBase):
    pass


# DB 엔진 (한 번만 만든다)
# echo=True로 바꾸면 실행되는 SQL이 전부 출력된다 (쿼리 확인할 때만)
@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL이 .env에 없습니다. backend/.env에 추가해주세요.")

    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,  # 끊어진 연결을 쓰기 전에 감지해 다시 연결
        pool_recycle=300,  # 5분 넘은 연결은 새로 만든다 (Supabase 유휴 연결 끊김 대비)
    )


# 세션 팩토리 (한 번만 만든다). get_session_factory()()로 세션을 연다
@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=get_engine(), class_=AsyncSession, expire_on_commit=False)


# FastAPI 의존성 - 요청마다 세션을 열고 끝나면 닫는다
async def get_db():
    async with get_session_factory()() as session:
        yield session
