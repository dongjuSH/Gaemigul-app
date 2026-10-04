# dependencies.py
# 로그인 필요한 라우터에서 쓰는 공용 의존성 - Depends(get_current_user)

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.core.database import get_db
from backend.domain.auth.models.auth import AuthUser
from backend.domain.auth.services import session_service

# 쿠키 이름은 .env로 고정되는 값이라 모듈 로드 시 한 번만 읽는다
_SESSION_COOKIE_NAME = get_settings().session_cookie_name


async def get_current_user(
    session_token: str | None = Cookie(default=None, alias=_SESSION_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> AuthUser:
    if session_token is not None:
        user = await session_service.get_user_by_session_token(db, session_token)
        if user is not None:
            return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인이 필요합니다.")
