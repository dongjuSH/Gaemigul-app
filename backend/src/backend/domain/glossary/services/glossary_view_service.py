# glossary_view_service.py
# 용어 열람 기록 - 등급 시스템의 "활동 점수"(서로 다른 용어 열람 개수) 산정용

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.domain.glossary.models.glossary_term import GlossaryTerm
from backend.domain.glossary.models.glossary_view_log import GlossaryViewLog


# 이미 본 용어면 그냥 recorded=False로 응답한다(에러 아님 - 중복 열람은 정상적인 경우다)
async def record_view(session: AsyncSession, user_id: int, term_id: int) -> bool:
    term_exists = await session.scalar(select(GlossaryTerm.id).where(GlossaryTerm.id == term_id))
    if term_exists is None:
        return False

    existing = await session.scalar(
        select(GlossaryViewLog.id).where(GlossaryViewLog.user_id == user_id, GlossaryViewLog.term_id == term_id)
    )
    if existing is not None:
        return False

    session.add(GlossaryViewLog(user_id=user_id, term_id=term_id))
    await session.commit()
    return True
