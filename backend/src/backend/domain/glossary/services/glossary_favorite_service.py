# glossary_favorite_service.py
# 관심 용어 즐겨찾기 - glossary_view_log(열람 기록)와 별개 개념/테이블

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.domain.glossary.models.glossary_favorite import GlossaryFavorite
from backend.domain.glossary.models.glossary_term import GlossaryTerm
from backend.domain.glossary.schemas.glossary_term import GlossaryTermResponse
from backend.domain.glossary.services.glossary_term_service import to_response


# 이미 즐겨찾기했으면 해제, 아니면 추가. 없는 term_id면 favorited=False로 조용히 무시
async def toggle_favorite(session: AsyncSession, user_id: int, term_id: int) -> bool:
    term_exists = await session.scalar(select(GlossaryTerm.id).where(GlossaryTerm.id == term_id))
    if term_exists is None:
        return False

    existing = await session.scalar(
        select(GlossaryFavorite).where(GlossaryFavorite.user_id == user_id, GlossaryFavorite.term_id == term_id)
    )

    if existing is not None:
        await session.delete(existing)
        await session.commit()
        return False

    session.add(GlossaryFavorite(user_id=user_id, term_id=term_id))
    await session.commit()
    return True


async def list_favorite_term_ids(session: AsyncSession, user_id: int) -> list[int]:
    rows = await session.scalars(select(GlossaryFavorite.term_id).where(GlossaryFavorite.user_id == user_id))
    return list(rows)


# 마이페이지 "즐겨찾는 용어" 목록용 - 즐겨찾은 순서(최근 추가 순)로 용어 전체 내용을 내려준다
async def list_favorite_terms(session: AsyncSession, user_id: int) -> list[GlossaryTermResponse]:
    rows = await session.scalars(
        select(GlossaryTerm)
        .join(GlossaryFavorite, GlossaryFavorite.term_id == GlossaryTerm.id)
        .where(GlossaryFavorite.user_id == user_id)
        .order_by(GlossaryFavorite.created_at.desc())
    )
    return [to_response(row) for row in rows]
