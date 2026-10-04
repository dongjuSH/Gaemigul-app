# glossary_term_service.py
# glossary_term 테이블 저장·조회 담당.

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_session_factory
from backend.domain.glossary.models.glossary_term import GlossaryTerm
from backend.domain.glossary.schemas.glossary_term import GlossaryTermResponse


# related_terms(쉼표 구분 문자열) -> 태그 목록. timeline_service의 beginner_guide.tags 파싱과 동일한 방식
def parse_related_terms(raw: str | None) -> list[str]:
    return [tag.strip() for tag in (raw or "").split(",") if tag.strip()]


def to_response(term: GlossaryTerm) -> GlossaryTermResponse:
    return GlossaryTermResponse(
        id=term.id,
        term=term.term,
        difficulty=term.difficulty,
        category=term.category,
        easy_description=term.easy_description,
        mid_description=term.mid_description,
        hard_description=term.hard_description,
        related_terms=parse_related_terms(term.related_terms),
    )


# 용어 하나를 term 기준으로 upsert한다 (같은 term이 있으면 내용만 갱신, 없으면 새로 추가)
async def _upsert_term(session: AsyncSession, row: dict) -> GlossaryTerm:
    existing = await session.scalar(select(GlossaryTerm).where(GlossaryTerm.term == row["term"]))

    if existing is None:
        existing = GlossaryTerm(term=row["term"])
        session.add(existing)

    existing.difficulty = row["difficulty"]
    existing.category = row.get("category")
    existing.easy_description = row["easy_description"]
    existing.mid_description = row["mid_description"]
    existing.hard_description = row["hard_description"]
    existing.related_terms = row.get("related_terms")

    return existing


# rows: seed_glossary_terms.py의 SEED_TERMS 같은 dict 목록. 재실행해도 안전하다(upsert)
async def upsert_terms(rows: list[dict]) -> list[GlossaryTerm]:
    async with get_session_factory()() as session:
        terms = [await _upsert_term(session, row) for row in rows]
        await session.commit()
        for term in terms:
            await session.refresh(term)
        return terms


# GET /glossary/terms용 - 전체 목록. term 기준 정렬(가나다 순). category를 주면 그 카테고리만.
# 용어사전 페이지는 전체를 받아 검색·톤 전환·카테고리 필터를 프런트에서 처리한다(타임라인 툴팁 등도
# 전체 목록이 필요해서). category 파라미터는 다른 화면이 일부만 필요할 때를 위한 것
async def list_terms(session: AsyncSession, category: str | None = None) -> list[GlossaryTermResponse]:
    query = select(GlossaryTerm).order_by(GlossaryTerm.term)
    if category is not None:
        query = query.where(GlossaryTerm.category == category)
    rows = await session.scalars(query)
    return [to_response(row) for row in rows]
